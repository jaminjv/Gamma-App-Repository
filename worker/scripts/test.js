/* Exercises the Worker without the network: the Resend call is stubbed, so
   nothing is sent and no key is needed.
     node worker/scripts/test.js
   Covers the three forms, the honeypot, the origin allowlist, the no-script
   fallback, and what happens when Resend refuses. */

// Defaults to the modules; pass a path to test the bundled build instead:
//   node worker/scripts/test.js ../dist/nixora-forms.js
const target = process.argv[2] || '../src/index.js';
const worker = (await import(target)).default;

const ENV = {
  SITE_URL: 'https://www.nixoraservices.com',
  FROM_EMAIL: 'Nixora Services <notifications@nixoraservices.com>',
  TO_EMAIL: 'info@nixoraservices.com',
  TO_APPLICATIONS: 'jobs@nixoraservices.com',
  ALLOWED_ORIGINS: 'https://www.nixoraservices.com,https://nixoraservices.com',
  RESEND_API_KEY: 're_test_key'
};

let sent = null, failNext = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('api.resend.com')) {
    sent = { url: String(url), headers: init.headers, body: JSON.parse(init.body) };
    return failNext
      ? new Response('{"message":"domain not verified"}', { status: 403 })
      : new Response('{"id":"abc"}', { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(url, init);
};

const post = (fields, opts = {}) => {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
  const headers = {};
  if (opts.origin !== null) headers.Origin = opts.origin || 'https://www.nixoraservices.com';
  if (!opts.noJson) headers.Accept = 'application/json';
  return new Request('https://nixora-forms.workers.dev/', { method: 'POST', body: fd, headers });
};

const APP = {
  'Position Applied For': 'Regular Cleaning', 'Full Name': 'Pepito Perez',
  email: 'pepito@ejemplo.com', Phone: '(314) 409-7141', 'Date of Birth': '1990-02-02',
  'Street Address': '9 Oak St', City: 'St. Louis', State: 'MO', 'ZIP Code': '63101',
  'Emergency Contact': 'Maria Perez', 'Emergency Phone': '(314) 555-2222',
  'Certified Accurate': 'yes', 'Accepted Digital Data Handling': 'yes',
  'Electronic Signature': 'Pepito Perez', 'Signed On': '2026-09-01',
  _subject: 'ignored by the worker', _gotcha: ''
};
const CONTACT = { name: 'Laura Gomez', email: 'laura@x.com', Phone: '(314) 555-4410',
  'Service Needed': 'Pressure Washing', Message: 'Quote please' };
const REVIEW = { name: 'Carlos Ruiz', Rating: '4', 'Reviewer Type': 'Client', Message: 'Great crew' };

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
};

// 1 — application
sent = null;
let r = await worker.fetch(post(APP), ENV);
check('application returns 200', r.status === 200, r.status);
check('application body ok', JSON.stringify(await r.clone().json()) === '{"ok":true}');
check('CORS echoes the origin',
  r.headers.get('access-control-allow-origin') === 'https://www.nixoraservices.com');
check('subject built server-side',
  sent.body.subject === 'Pepito Perez applied — Regular Cleaning', sent.body.subject);
check('routed to TO_APPLICATIONS', sent.body.to[0] === 'jobs@nixoraservices.com', sent.body.to);
check('reply-to is the applicant', sent.body.reply_to === 'pepito@ejemplo.com');
check('from is the configured identity', sent.body.from === ENV.FROM_EMAIL);
check('bearer token sent', sent.headers.authorization === 'Bearer re_test_key');
check('html carries the hosted logo',
  sent.body.html.includes('https://www.nixoraservices.com/assets/img/mail-logo.png'));
check('dob formatted', sent.body.html.includes('February 2, 1990'));
check('tel link normalised', sent.body.html.includes('tel:+13144097141'));
check('unchecked declaration omitted',
  !sent.body.html.includes('Accepted SMS and WhatsApp updates'));
check('checked declaration present',
  sent.body.html.includes('Certified the information is accurate'));
check('empty optional row dropped', !sent.body.html.includes('>Notes<'));
check('plain-text part present', sent.body.text.includes('Pepito Perez'));
check('client _subject ignored', !sent.body.subject.includes('ignored'));

// 2 — contact
sent = null;
r = await worker.fetch(post(CONTACT), ENV);
check('contact returns 200', r.status === 200);
check('contact subject', sent.body.subject === 'Laura Gomez — new service request', sent.body.subject);
check('contact falls back to TO_EMAIL', sent.body.to[0] === 'info@nixoraservices.com');

// 3 — review
sent = null;
r = await worker.fetch(post(REVIEW), ENV);
check('review subject', sent.body.subject === 'Carlos Ruiz left a 4-star review', sent.body.subject);
check('review has no reply-to', !('reply_to' in sent.body));

// 4 — honeypot
sent = null;
r = await worker.fetch(post({ ...CONTACT, _gotcha: 'spam' }), ENV);
check('honeypot answers 200', r.status === 200);
check('honeypot sends nothing', sent === null);

// 5 — foreign origin
sent = null;
r = await worker.fetch(post(CONTACT, { origin: 'https://evil.example' }), ENV);
check('foreign origin refused', r.status === 403, r.status);
check('foreign origin sends nothing', sent === null);
let refusal = await r.json();
check('refusal names the origin', refusal.origin === 'https://evil.example', refusal.origin);
check('refusal lists what is allowed', Array.isArray(refusal.allowed) && refusal.allowed.length === 2);
check('refusal is readable by the page',
  r.headers.get('access-control-allow-origin') === 'https://evil.example');

// 5b — the settings typed with a trailing slash, or in capitals, still match
sent = null;
r = await worker.fetch(post(CONTACT), {
  ...ENV, ALLOWED_ORIGINS: 'https://WWW.nixoraservices.com/ , https://nixoraservices.com/'
});
check('trailing slash in the setting tolerated', r.status === 200, r.status);
check('and it still sends', sent && sent.body.subject.includes('Laura Gomez'));

// 6 / 7 — method handling
r = await worker.fetch(new Request('https://nixora-forms.workers.dev/', { method: 'GET' }), ENV);
check('GET refused', r.status === 405);
r = await worker.fetch(new Request('https://nixora-forms.workers.dev/', {
  method: 'OPTIONS', headers: { Origin: 'https://nixoraservices.com' } }), ENV);
check('preflight answered', r.status === 204);
check('preflight allows POST', r.headers.get('access-control-allow-methods') === 'POST, OPTIONS');

// 8 — no JavaScript: plain form POST
sent = null;
r = await worker.fetch(post(CONTACT, { noJson: true }), ENV);
check('no-JS submission redirects', r.status === 303, r.status);
check('redirects to thank-you',
  r.headers.get('location') === 'https://www.nixoraservices.com/thank-you.html',
  r.headers.get('location'));
check('no-JS submission still sends', sent && sent.body.subject.includes('Laura Gomez'));

// 9 — Resend rejects
failNext = true;
r = await worker.fetch(post(CONTACT), ENV);
check('send failure surfaces as 502', r.status === 502, r.status);
failNext = false;

// 10 — misconfiguration
r = await worker.fetch(post(CONTACT), { ...ENV, RESEND_API_KEY: '' });
check('missing key returns 500', r.status === 500);

// 11 — XSS in a submitted value
sent = null;
await worker.fetch(post({ ...CONTACT, name: '<script>alert(1)</script>' }), ENV);
check('submitted markup escaped', !sent.body.html.includes('<script>alert(1)</script>'));
check('escaped form present', sent.body.html.includes('&lt;script&gt;'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
