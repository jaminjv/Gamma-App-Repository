/* ==========================================================================
   Nixora Services LLC — form endpoint.

   Receives the three site forms, renders a branded notification and hands it
   to Resend. It replaces Formspree so the subject line, the layout and the
   sending address all belong to Nixora rather than to a third party.

   Configuration lives in wrangler.toml ([vars]); the Resend key is a secret:
     npx wrangler secret put RESEND_API_KEY
   ========================================================================== */

import { renderEmail, renderText, escapeHtml } from './email.js';
import { detectFormType, buildSpec, sheetRow } from './forms.js';
import { suggest, details } from './places.js';
import { lookupZip, verifyAddress } from './address.js';
import { checkEmail } from './email-check.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/* Stamped on every response the Worker makes about itself. Deploying through
   the dashboard editor is easy to get wrong in a way that leaves the previous
   version running and says nothing, which cost two rounds of fixing code that
   was never live. Bump this whenever src/ changes. */
const BUILD = '2026-09-15.6';

// A job application with long notes is a few kilobytes. Anything past this is
// not a person filling in a form.
const MAX_BODY_BYTES = 128 * 1024;

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });

/* An origin is a scheme, host and port — never a path, never a trailing
   slash, never uppercase. Normalising both sides means a setting typed as
   "https://www.nixoraservices.com/" still matches, rather than refusing every
   submission from the site it was meant to allow. */
const normalizeOrigin = (value) =>
  String(value || '').trim().toLowerCase().replace(/\/+$/, '');

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
}

const originAllowed = (request, env) =>
  allowedOrigins(env).indexOf(normalizeOrigin(request.headers.get('Origin'))) !== -1;

/* Echoes the origin back when it is on the list. A refusal still carries the
   header, so the page can read why it was refused: the request was already
   turned away, and the reason is the site's own public address. Without it the
   browser hides the response and all anyone sees is an opaque CORS failure. */
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const headers = { 'vary': 'Origin' };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = 'POST, OPTIONS';
    headers['access-control-allow-headers'] = 'Content-Type, Accept';
    headers['access-control-max-age'] = '86400';
  }
  return headers;
}

/* The site posts with fetch and asks for JSON. A browser that fell back to a
   plain form POST gets sent to the thank-you page instead. */
const wantsJson = (request) =>
  String(request.headers.get('Accept') || '').indexOf('application/json') !== -1;

function recipient(env, type) {
  const perForm = {
    application: env.TO_APPLICATIONS,
    contact: env.TO_CONTACT,
    review: env.TO_REVIEWS
  }[type];
  return String(perForm || env.TO_EMAIL || '').trim();
}

async function readForm(request) {
  const contentType = String(request.headers.get('Content-Type') || '');
  if (contentType.indexOf('application/json') !== -1) {
    const body = await request.json();
    const form = new FormData();
    Object.keys(body || {}).forEach((key) => form.append(key, String(body[key])));
    return form;
  }
  return request.formData();
}

/* Keys get pasted with a stray space, a newline, wrapping quotes, or the word
   Bearer already in front. Every one of those reaches Resend as an invalid key
   and comes back as a validation error that says nothing about whitespace, so
   they are stripped here rather than diagnosed twice. */
const cleanKey = (value) =>
  String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^Bearer\s+/i, '')
    .trim();

async function send(env, { to, replyTo, subject, html, text }) {
  const payload = {
    from: env.FROM_EMAIL,
    to: [to],
    subject,
    html,
    text
  };
  if (replyTo) payload.reply_to = replyTo;

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + cleanKey(env.RESEND_API_KEY),
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    // Resend answers with { message } on a rejection. Keep that sentence on
    // the error: it names the actual problem — an unverified domain, a
    // malformed from address, a key without sending access — where the status
    // code alone would only say "it did not work".
    let message = body;
    try {
      const parsed = JSON.parse(body);
      if (parsed && parsed.message) message = parsed.message;
    } catch (ignored) { /* not JSON — keep the raw body */ }

    const error = new Error('Resend responded ' + response.status + ': ' + message);
    error.detail = String(message).slice(0, 300);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/* GET /selftest — answers "is this thing configured correctly" without
   sending anything. Diagnosing a rejected send otherwise means reading the
   Worker's log, which is the hardest place to reach for the person who has to
   act on what it says; this is a URL you can open in a browser.

   It reports what is set, never what it is set to, with one exception: the
   addresses, which are printed on the website anyway. The key is described --
   present, length, plausible prefix -- and never echoed. */
/* Appends the submission to the Google Sheet, when one is configured.

   This runs after the email has already gone. A spreadsheet that did not get
   its row is worth knowing about, but it is not worth failing a job
   application over, so a failure here is logged and reported through the
   self-test rather than shown to the person who filled in the form. */
/* Apps Script answers a POST with a 302 to where the result is waiting, and
   following a 302 turns the request into a GET — which lands on doGet, which
   this script does not define. So doPost ran, the row was written, and the
   Worker read back an error page for a call that had already succeeded.

   The redirect is followed by hand instead: POST once, then GET the location
   the way Apps Script intends. */
async function postToAppsScript(endpoint, payload) {
  const posted = await fetch(endpoint, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  // A redirect is the success signal, and the only reliable one. Apps Script
  // redirects to where the output is waiting *after* doPost has run to
  // completion; a script that threw answers 200 with an error page instead,
  // and a deployment that cannot be reached answers 403 or 404. So the status
  // of this first response already says whether the row was written.
  if (posted.status >= 300 && posted.status < 400) {
    const location = posted.headers.get('location');
    const result = { status: 200, body: '{"ok":true}', redirected: true };
    if (!location) return result;

    // The body is worth having when it can be had — it carries the script's
    // own {ok:false, error} for a row it declined, such as a bad token. But
    // that second hop is a one-use URL and sometimes 404s by the time it is
    // asked for, which says nothing about whether doPost succeeded.
    try {
      const echoed = await fetch(location, { method: 'GET' });
      const body = (await echoed.text()).slice(0, 300);
      if (echoed.ok && /"ok"\s*:/.test(body)) return { status: 200, body, redirected: true };
    } catch (ignored) { /* the redirect already told us what we needed */ }

    return result;
  }

  return { status: posted.status, body: (await posted.text()).slice(0, 300) };
}

async function appendToSheet(env, form, type) {
  const endpoint = String(env.SHEET_WEBHOOK_URL || '').trim();
  if (!endpoint) return { configured: false };

  const row = sheetRow(form, type);
  const answer = await postToAppsScript(endpoint,
    { token: String(env.SHEET_TOKEN || ''), ...row });

  // Apps Script answers 200 with an HTML error page when the script itself
  // threw, so the status alone does not settle it.
  const ok = answer.status < 400 && /"ok"\s*:\s*true/.test(answer.body);
  if (!ok) throw new Error('Sheet responded ' + answer.status + ': ' + answer.body);
  return { configured: true, ok: true, tab: row.tab };
}

/* Writes one row to a tab of its own, so the answer to "is the spreadsheet
   still there" does not depend on reading a log, and does not put a fake
   applicant among the real ones. */
async function trySheet(env) {
  const endpoint = String(env.SHEET_WEBHOOK_URL || '').trim();
  if (!endpoint) return { configured: false };

  const answer = await postToAppsScript(endpoint, {
    token: String(env.SHEET_TOKEN || ''),
    tab: 'Endpoint tests',
    columns: ['Received', 'Note'],
    values: [new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
             'Written by /selftest?sheet=1. Nobody filled in a form.']
  });

  const ok = answer.status < 400 && /"ok"\s*:\s*true/.test(answer.body);
  return { configured: true, ok, status: answer.status, answer: answer.body };
}

/* Everything the self-test can read is correct and the send still fails, so
   the only thing left to look at is what Resend says when it is actually asked
   to send. This performs one real send to the configured recipient -- never to
   an address from the request -- and reports the answer verbatim. */
async function trySending(env) {
  const to = recipient(env, 'contact');
  try {
    await send(env, {
      to,
      replyTo: '',
      subject: 'Nixora Services — endpoint test',
      html: '<p>This is the form endpoint testing itself. Nobody filled in a form.</p>',
      text: 'This is the form endpoint testing itself. Nobody filled in a form.'
    });
    return { attempted: true, ok: true, to, note: 'Resend accepted it. Check ' + to + '.' };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      to,
      status: error && error.status,
      message: error && error.detail ? error.detail : String(error && error.message || '')
    };
  }
}

async function selftest(env, options) {
  const key = cleanKey(env.RESEND_API_KEY);
  const report = {
    build: BUILD,
    settings: {
      SITE_URL: env.SITE_URL || null,
      FROM_EMAIL: env.FROM_EMAIL || null,
      TO_EMAIL: recipient(env, 'contact') || null,
      ALLOWED_ORIGINS: allowedOrigins(env)
    },
    key: {
      present: Boolean(key),
      length: key.length,
      startsWithRe: key.slice(0, 3) === 're_',
      hadStrayCharacters: key !== String(env.RESEND_API_KEY || '')
    }
  };

  if (!key) {
    report.verdict = 'RESEND_API_KEY is empty. Add it as a Secret and deploy again.';
    return report;
  }

  // Described, never echoed — the same treatment the Resend key gets. A key
  // that is the wrong length or has the wrong prefix is a key from another
  // project, or one that lost characters on the way into the dashboard, and
  // neither is visible from "API key not valid".
  const placesKey = String(env.GOOGLE_PLACES_KEY || '').trim();
  report.places = {
    configured: Boolean(placesKey),
    keyLength: placesKey.length,
    startsWithAIza: placesKey.slice(0, 4) === 'AIza',
    expectedLength: 39
  };

  // ?places=1 runs one real lookup and reports Google's answer verbatim.
  // Whether the key works, whether the right API is enabled and whether
  // billing is on all fail differently, and only Google can say which.
  if (options && options.places) {
    if (!report.places.configured) {
      report.verdict = 'GOOGLE_PLACES_KEY is not set, so the address field is a ' +
        'plain text box. That is a working state, not a fault.';
      return report;
    }
    try {
      const result = await suggest(env, '1 Market St, St. Louis', 'selftest-session');
      report.places.matches = result.suggestions.length;
      report.places.example = result.suggestions[0] || null;
      report.verdict = result.suggestions.length
        ? 'Address lookup works. ' + result.suggestions.length + ' matches for a St. Louis address.'
        : 'Google accepted the key but returned nothing, which usually means the ' +
          'wrong Places API is enabled — it has to be Places API (New).';
    } catch (error) {
      report.places.status = error && error.status;
      report.places.message = error && error.detail;

      // "API key not valid" says nothing about which of its causes applies,
      // so the shape of what was stored is reported alongside it.
      const shape = report.places.startsWithAIza && report.places.keyLength === 39
        ? 'The stored key has the right shape, so it is more likely the wrong ' +
          'key — one from a deleted project, or from a project where Places API ' +
          '(New) is not enabled. A key created in the last few minutes can also ' +
          'need a little longer.'
        : 'The stored key does not look like a Google key: it is ' +
          report.places.keyLength + ' characters and ' +
          (report.places.startsWithAIza ? 'starts with AIza' : 'does not start with AIza') +
          ', where a Google key is 39 and does. Whatever is in GOOGLE_PLACES_KEY ' +
          'is not the key you copied.';

      report.verdict = 'Google refused the lookup: ' + (error && error.detail) + ' — ' + shape;
    }
    return report;
  }
  report.sheet = { configured: Boolean(String(env.SHEET_WEBHOOK_URL || '').trim()) };
  if (report.sheet.configured) {
    report.sheet.tokenSet = Boolean(String(env.SHEET_TOKEN || '').trim());
  }

  if (options && options.sheet) {
    if (!report.sheet.configured) {
      report.verdict = 'SHEET_WEBHOOK_URL is empty, so nothing is being written ' +
        'to a spreadsheet. The email is unaffected.';
      return report;
    }
    try {
      const attempt = await trySheet(env);
      report.sheet.test = attempt;
      // These fail differently and are fixed differently, so they are told
      // apart rather than lumped together as "something is wrong with the
      // sheet". A 404 in particular sends people hunting for a permission
      // problem that is not there.
      const signIn = /accounts\.google\.com|ServiceLogin|sign in to continue/i
        .test(attempt.answer);
      const html = /^\s*<!doctype html|^\s*<html/i.test(attempt.answer);

      report.verdict = attempt.ok
        ? 'The spreadsheet accepted a row. Look for a tab called "Endpoint tests".'
        : attempt.status === 404
          ? 'The script URL no longer exists (404). The spreadsheet or its Web App ' +
            'deployment has been deleted, so SHEET_WEBHOOK_URL points at nothing. ' +
            'It needs setting up again, and the new /exec URL stored here.'
          : attempt.status === 403
            ? 'The deployment exists but refuses this request (403). That is what ' +
              '"Who has access" set to anything other than "Anyone" does: the Worker ' +
              'arrives signed in as nobody. Edit the existing deployment rather than ' +
              'making a new one, so the URL stays the same.'
            : signIn
            ? 'The script answered with a sign-in page, which means the Web App is ' +
              'no longer deployed for "Anyone". Redeploy it with that access.'
            : html
              ? 'The script answered with an error page (' + attempt.status + '), which ' +
                'is what Apps Script returns when the script itself threw. Open the ' +
                'script and check its executions.'
              : 'The script refused the row (' + attempt.status + '): ' + attempt.answer;
    } catch (error) {
      report.sheet.test = { ok: false, error: String(error && error.message).slice(0, 200) };
      report.verdict = 'Could not reach the script at all: ' + (error && error.message);
    }
    return report;
  }

  if (options && options.send) {
    report.send = await trySending(env);
    report.verdict = report.send.ok
      ? 'Sent. If it does not arrive, the problem is delivery rather than ' +
        'configuration — look in spam, then at the Resend dashboard.'
      : 'Resend refused the send: ' + report.send.message;
    return report;
  }

  // Asking Resend for the domain list is the cheapest way to find out whether
  // it accepts the key at all, and where the key is allowed to read them it
  // doubles as a check that the address the Worker sends from belongs to a
  // domain that is actually verified.
  //
  // A sending-only key cannot read that list, and Resend refuses it with a 401
  // that says so. That refusal is the right answer for this endpoint -- it is
  // proof the key is real and scoped exactly as it should be -- so it must not
  // be reported as a broken key.
  let response;
  try {
    response = await fetch('https://api.resend.com/domains', {
      headers: { authorization: 'Bearer ' + key }
    });
  } catch (error) {
    report.verdict = 'Could not reach Resend: ' + (error && error.message);
    return report;
  }

  const body = await response.text();
  report.resend = { status: response.status };

  if (response.status === 401 || response.status === 403 || response.status === 400) {
    let message = body;
    try { message = (JSON.parse(body) || {}).message || body; } catch (ignored) { /* raw */ }
    message = String(message).slice(0, 200);
    report.resend.message = message;

    if (/restricted to only send/i.test(message)) {
      report.resend.keyScope = 'sending only';
      report.verdict = 'The key is valid and scoped to sending, which is what this ' +
        'endpoint needs. A key like that cannot read the domain list, so whether ' +
        'the sending domain is verified has to be checked in the Resend dashboard. ' +
        'Submit the form to test the rest.';
      return report;
    }

    report.verdict = 'Resend refuses this API key. Create a new one with Sending ' +
      'access and replace RESEND_API_KEY.';
    return report;
  }

  if (!response.ok) {
    report.resend.message = body.slice(0, 200);
    report.verdict = 'Resend answered ' + response.status + '.';
    return report;
  }

  let domains = [];
  try {
    const parsed = JSON.parse(body);
    domains = (parsed.data || parsed || []).map((d) => ({ name: d.name, status: d.status }));
  } catch (ignored) { /* leave empty */ }
  report.resend.domains = domains;

  const match = /@([^>\s]+)>?\s*$/.exec(String(env.FROM_EMAIL || ''));
  const sendingDomain = match ? match[1].toLowerCase() : null;
  const verified = domains.some((d) =>
    d.name && d.name.toLowerCase() === sendingDomain && String(d.status).toLowerCase() === 'verified');

  report.verdict = !sendingDomain
    ? 'FROM_EMAIL does not contain a readable address. It should look like: ' +
      'Nixora Services <notifications@nixoraservices.com>'
    : verified
      ? 'All good. The key works and ' + sendingDomain + ' is verified for sending.'
      : 'The key works, but ' + sendingDomain + ' is not listed as verified in this ' +
        'Resend account. Check FROM_EMAIL against the domains above.';
  return report;
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const origin = request.headers.get('Origin');
    const url = new URL(request.url);

    /* Address lookup. Both paths are POST because the site posts JSON to
       them; a failure answers 200 with an empty list rather than an error,
       so a Google outage or a spent quota costs the applicant a convenience
       and never the ability to type their own address. */
    if (url.pathname === '/places/suggest' || url.pathname === '/places/details') {
      if (request.method !== 'POST') {
        return json({ ok: false, error: 'Send this with POST.' }, 405, cors);
      }
      if (origin && !originAllowed(request, env)) {
        return json({ ok: false, error: 'Origin not allowed.' }, 403, cors);
      }

      let payload = {};
      try { payload = await request.json(); } catch (ignored) { /* empty */ }

      try {
        if (url.pathname === '/places/suggest') {
          const input = String(payload.input || '').trim();
          if (input.length < 4) return json({ ok: true, suggestions: [] }, 200, cors);
          const result = await suggest(env, input, payload.sessionToken);
          return json({ ok: true, ...result }, 200, cors);
        }
        const result = await details(env, String(payload.placeId || ''), payload.sessionToken);
        return json({ ok: true, ...result }, 200, cors);
      } catch (error) {
        console.error('Places lookup failed:', error && error.message);
        return json({ ok: false, suggestions: [], detail: error && error.detail }, 200, cors);
      }
    }

    /* Address help that needs no account: a ZIP turned into a city and state,
       and a typed address checked against the US Census file. Both answer
       "unknown" rather than an error when the public service is unreachable,
       so the form is never held up by one. */
    if (url.pathname === '/address/zip' || url.pathname === '/address/verify') {
      if (request.method !== 'POST') {
        return json({ ok: false, error: 'Send this with POST.' }, 405, cors);
      }
      if (origin && !originAllowed(request, env)) {
        return json({ ok: false, error: 'Origin not allowed.' }, 403, cors);
      }

      let payload = {};
      try { payload = await request.json(); } catch (ignored) { /* empty */ }

      const result = url.pathname === '/address/zip'
        ? await lookupZip(payload.zip)
        : await verifyAddress(payload || {});

      return json({ ok: true, ...result }, 200, cors);
    }

    /* Whether an address can receive mail at all. Answers "unknown" rather
       than an error when the lookup does not come back, because a DNS query
       that timed out is not evidence against somebody's email address. */
    if (url.pathname === '/email/check') {
      if (request.method !== 'POST') {
        return json({ ok: false, error: 'Send this with POST.' }, 405, cors);
      }
      if (origin && !originAllowed(request, env)) {
        return json({ ok: false, error: 'Origin not allowed.' }, 403, cors);
      }

      let payload = {};
      try { payload = await request.json(); } catch (ignored) { /* empty */ }

      return json({ ok: true, ...(await checkEmail(payload.email)) }, 200, cors);
    }

    if (url.pathname === '/selftest') {
      // ?send=1 posts one real message to the configured recipient. The
      // recipient never comes from the request, so this cannot be pointed at
      // anyone else.
      return json(await selftest(env, {
        send: url.searchParams.get('send') === '1',
        places: url.searchParams.get('places') === '1',
        sheet: url.searchParams.get('sheet') === '1'
      }), 200, cors);
    }

    if (request.method !== 'POST') {
      return json({
        ok: false,
        error: 'Send this form with POST.',
        build: BUILD,
        hint: 'Add /selftest to this URL to check the settings.'
      }, 405, cors);
    }

    if (origin && !originAllowed(request, env)) {
      const configured = allowedOrigins(env);
      console.error('Refused origin ' + origin + '. ALLOWED_ORIGINS holds: ' +
        (configured.length ? configured.join(', ') : '(nothing)'));
      return json({
        ok: false,
        error: 'This site is not on the endpoint\'s allowed list.',
        origin: normalizeOrigin(origin),
        allowed: configured
      }, 403, cors);
    }

    const declaredLength = Number(request.headers.get('Content-Length') || 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return json({ ok: false, error: 'Submission too large.' }, 413, cors);
    }

    let form;
    try {
      form = await readForm(request);
    } catch (error) {
      return json({ ok: false, error: 'Could not read the submission.' }, 400, cors);
    }

    // Honeypot: bots fill in every field they find, people never see this one.
    // Answering 200 keeps them from working out that they were caught.
    if (String(form.get('_gotcha') || '').trim()) {
      return wantsJson(request)
        ? json({ ok: true }, 200, cors)
        : Response.redirect(env.SITE_URL + '/thank-you.html', 303);
    }

    const type = detectFormType(form);
    const to = recipient(env, type);
    if (!to || !env.FROM_EMAIL || !cleanKey(env.RESEND_API_KEY)) {
      console.error('Worker is missing TO_EMAIL, FROM_EMAIL or RESEND_API_KEY.');
      return json({ ok: false, error: 'The form endpoint is not configured.' }, 500, cors);
    }

    const spec = buildSpec(form, type);
    const siteUrl = String(env.SITE_URL || 'https://www.nixoraservices.com').replace(/\/$/, '');
    const pageUrl = siteUrl + '/' + spec.page;

    spec.logoUrl = siteUrl + '/assets/img/mail-logo.png';
    spec.footer = `Sent from the ${escapeHtml(spec.formName)} at ` +
      `<a href="${escapeHtml(pageUrl)}" style="color:#054a8b;">nixoraservices.com</a>. ` +
      escapeHtml(spec.footerNote);
    spec.footerText = 'Sent from the ' + spec.formName + ' at ' + pageUrl + '. ' + spec.footerNote;

    try {
      await send(env, {
        to,
        replyTo: spec.replyTo,
        subject: spec.subject,
        html: renderEmail(spec),
        text: renderText(spec)
      });
    } catch (error) {
      console.error('Sending failed:', error && error.message);
      // The detail goes back to the page as well as to the log. It is the
      // mail service's own description of a misconfiguration, carrying no
      // credential, and it reaches only origins already on the allowed list —
      // which is to say the site's own pages. Leaving it in the log alone
      // meant the one person who could fix it had the hardest path to reading
      // it.
      return json({
        ok: false,
        error: 'The message could not be sent.',
        detail: error && error.detail ? error.detail : String(error && error.message || ''),
        from: env.FROM_EMAIL,
        to: to
      }, 502, cors);
    }

    // The email is the part that must not fail, and it has already gone.
    try {
      await appendToSheet(env, form, type);
    } catch (error) {
      console.error('Sheet append failed:', error && error.message);
    }

    return wantsJson(request)
      ? json({ ok: true }, 200, cors)
      : Response.redirect(siteUrl + '/thank-you.html', 303);
  }
};
