/* ==========================================================================
   Nixora Services LLC — form endpoint.

   Receives the three site forms, renders a branded notification and hands it
   to Resend. It replaces Formspree so the subject line, the layout and the
   sending address all belong to Nixora rather than to a third party.

   Configuration lives in wrangler.toml ([vars]); the Resend key is a secret:
     npx wrangler secret put RESEND_API_KEY
   ========================================================================== */

import { renderEmail, renderText, escapeHtml } from './email.js';
import { detectFormType, buildSpec } from './forms.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

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

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Send this form with POST.' }, 405, cors);
    }

    const origin = request.headers.get('Origin');
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

    return wantsJson(request)
      ? json({ ok: true }, 200, cors)
      : Response.redirect(siteUrl + '/thank-you.html', 303);
  }
};
