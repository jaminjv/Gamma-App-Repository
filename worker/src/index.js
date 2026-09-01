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

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/* Echoes the origin back only when it is on the list. An unknown origin gets
   no CORS header at all, so the browser blocks the response. */
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const headers = { 'vary': 'Origin' };
  if (origin && allowedOrigins(env).indexOf(origin) !== -1) {
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
      authorization: 'Bearer ' + env.RESEND_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error('Resend responded ' + response.status + ': ' + detail);
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
    if (origin && allowedOrigins(env).indexOf(origin) === -1) {
      return json({ ok: false, error: 'Origin not allowed.' }, 403, cors);
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
    if (!to || !env.FROM_EMAIL || !env.RESEND_API_KEY) {
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
      return json({ ok: false, error: 'The message could not be sent.' }, 502, cors);
    }

    return wantsJson(request)
      ? json({ ok: true }, 200, cors)
      : Response.redirect(siteUrl + '/thank-you.html', 303);
  }
};
