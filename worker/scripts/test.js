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

let sent = null, failNext = false, sheetPost = null, sheetFails = false;
const SHEET_URL = 'https://script.google.com/macros/s/deadbeef/exec';
const realFetch = globalThis.fetch;
let placesCall = null, placesFails = false;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('places.googleapis.com')) {
    placesCall = { url: String(url), headers: init.headers,
                   body: init.body ? JSON.parse(init.body) : null };
    if (placesFails) {
      return new Response('{"error":{"message":"API key not valid"}}', { status: 403 });
    }
    if (String(url).includes(':autocomplete')) {
      return new Response(JSON.stringify({ suggestions: [
        { placePrediction: { placeId: 'p1', structuredFormat: {
          mainText: { text: '10 Market St' }, secondaryText: { text: 'St. Louis, MO, USA' } } } }
      ] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      formattedAddress: '10 Market St, St. Louis, MO 63101, USA',
      addressComponents: [
        { longText: '10', shortText: '10', types: ['street_number'] },
        { longText: 'Market Street', shortText: 'Market St', types: ['route'] },
        { longText: 'St. Louis', shortText: 'St. Louis', types: ['locality'] },
        { longText: 'Missouri', shortText: 'MO', types: ['administrative_area_level_1'] },
        { longText: '63101', shortText: '63101', types: ['postal_code'] }
      ] }), { status: 200 });
  }
  if (String(url) === SHEET_URL) {
    sheetPost = JSON.parse(init.body);
    return sheetFails
      ? new Response('<html>Script error</html>', { status: 200 })
      : new Response('{"ok":true}', { status: 200 });
  }
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
const idle = await r.json();
check('GET names the build that is live', typeof idle.build === 'string' && idle.build.length > 0, idle.build);
check('GET points at the self-test', /selftest/.test(idle.hint || ''), idle.hint);
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
const failure = await r.json();
check('502 carries the reason Resend gave',
  failure.detail === 'domain not verified', JSON.stringify(failure.detail));
check('502 names the from address it tried', failure.from === ENV.FROM_EMAIL);
check('502 names the recipient it tried', failure.to === ENV.TO_EMAIL);
check('502 leaks no credential', !JSON.stringify(failure).includes(ENV.RESEND_API_KEY));
failNext = false;

// 10 — misconfiguration
r = await worker.fetch(post(CONTACT), { ...ENV, RESEND_API_KEY: '' });
check('missing key returns 500', r.status === 500);
r = await worker.fetch(post(CONTACT), { ...ENV, RESEND_API_KEY: '   ' });
check('whitespace-only key returns 500', r.status === 500);

// 10b — a key pasted with the usual stray characters still authenticates
for (const [label, value] of [
  ['padded with spaces', '  re_test_key  '],
  ['wrapped in quotes', '"re_test_key"'],
  ['carrying a newline', 're_test_key\n'],
  ['prefixed with Bearer', 'Bearer re_test_key']
]) {
  sent = null;
  r = await worker.fetch(post(CONTACT), { ...ENV, RESEND_API_KEY: value });
  check('key ' + label + ' is cleaned',
    r.status === 200 && sent.headers.authorization === 'Bearer re_test_key',
    sent && sent.headers.authorization);
}

// 11 — XSS in a submitted value
sent = null;
await worker.fetch(post({ ...CONTACT, name: '<script>alert(1)</script>' }), ENV);
check('submitted markup escaped', !sent.body.html.includes('<script>alert(1)</script>'));
check('escaped form present', sent.body.html.includes('&lt;script&gt;'));

// 12 — the self-test, which must never send and never echo the key
let seenAuth = null;
const selftest = async (env, resendReply) => {
  const previous = globalThis.fetch;
  seenAuth = null;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/domains')) {
      seenAuth = init.headers.authorization;
      return resendReply(init);
    }
    sent = JSON.parse(init.body);
    return new Response('{"id":"stub"}', { status: 200 });
  };
  sent = null;
  const res = await worker.fetch(
    new Request('https://nixora-forms.workers.dev/selftest', { method: 'GET' }), env);
  const out = await res.json();
  globalThis.fetch = previous;
  return { status: res.status, out };
};

const okDomains = () => new Response(JSON.stringify({
  data: [{ name: 'nixoraservices.com', status: 'verified' }]
}), { status: 200 });

let t = await selftest(ENV, okDomains);
check('selftest answers 200', t.status === 200, t.status);
check('selftest sends no email', sent === null);
check('selftest never echoes the key', !JSON.stringify(t.out).includes(ENV.RESEND_API_KEY));
check('selftest describes the key instead of showing it',
  t.out.key.present === true && t.out.key.startsWithRe === true &&
  t.out.key.length === ENV.RESEND_API_KEY.length, JSON.stringify(t.out.key));
check('selftest passes a verified domain',
  /All good/.test(t.out.verdict), t.out.verdict);
check('selftest authenticates with the cleaned key',
  seenAuth === 'Bearer ' + ENV.RESEND_API_KEY, seenAuth);

t = await selftest(ENV, () => new Response('{"message":"API key is invalid"}', { status: 401 }));
check('selftest names a refused key',
  /refuses this API key/.test(t.out.verdict), t.out.verdict);
check('selftest quotes Resend on a refused key',
  t.out.resend.message === 'API key is invalid', t.out.resend.message);

// A sending-only key is refused the domain list, and that refusal is a pass:
// it proves the key is real and scoped exactly as this endpoint needs.
t = await selftest(ENV, () => new Response(
  '{"message":"This API key is restricted to only send emails"}', { status: 401 }));
check('selftest treats a sending-only key as correct',
  /valid and scoped to sending/.test(t.out.verdict), t.out.verdict);
check('selftest does not tell you to replace a sending-only key',
  !/Create a new one/.test(t.out.verdict));
check('selftest records the scope it found', t.out.resend.keyScope === 'sending only');

t = await selftest({ ...ENV, FROM_EMAIL: 'Nixora <hello@otherdomain.com>' }, okDomains);
check('selftest catches a from address on an unverified domain',
  /not listed as verified/.test(t.out.verdict), t.out.verdict);

t = await selftest({ ...ENV, RESEND_API_KEY: '' }, okDomains);
check('selftest reports an empty key', /is empty/.test(t.out.verdict), t.out.verdict);

// 12b — ?send=1 posts one real message and reports what came back
const sendTest = async (env, reply) => {
  const previous = globalThis.fetch;
  let target = null;
  globalThis.fetch = async (url, init) => {
    target = String(url);
    sent = JSON.parse(init.body);
    return reply();
  };
  sent = null;
  const res = await worker.fetch(
    new Request('https://nixora-forms.workers.dev/selftest?send=1', { method: 'GET' }), env);
  const out = await res.json();
  globalThis.fetch = previous;
  return { out, target };
};

let st = await sendTest(ENV, () => new Response('{"id":"abc"}', { status: 200 }));
check('send test actually sends', sent !== null && st.target.includes('api.resend.com/emails'));
check('send test goes to the configured recipient only',
  sent.to[0] === ENV.TO_CONTACT || sent.to[0] === ENV.TO_EMAIL, sent.to);
check('send test reports success', st.out.send.ok === true && /Sent/.test(st.out.verdict), st.out.verdict);

st = await sendTest(ENV, () => new Response(
  '{"message":"The nixoraservices.com domain is not verified"}', { status: 403 }));
check('send test quotes a refusal verbatim',
  /domain is not verified/.test(st.out.verdict), st.out.verdict);
check('send test records the status', st.out.send.status === 403, st.out.send.status);

// without ?send=1 nothing is sent
st = await sendTest(ENV, () => new Response('{"id":"abc"}', { status: 200 }));
sent = null;
let plain = await worker.fetch(
  new Request('https://nixora-forms.workers.dev/selftest', { method: 'GET' }),
  { ...ENV, RESEND_API_KEY: '' });
check('selftest without send=1 sends nothing', sent === null);

// 13 — the spreadsheet row
const SHEET_ENV = { ...ENV, SHEET_WEBHOOK_URL: SHEET_URL, SHEET_TOKEN: 'shared-secret' };

sheetPost = null; sent = null;
r = await worker.fetch(post(APP), SHEET_ENV);
check('a submission reaches the sheet', r.status === 200 && sheetPost !== null);
check('sheet row carries the shared token', sheetPost.token === 'shared-secret');
check('sheet row goes to the Applications tab', sheetPost.tab === 'Applications', sheetPost.tab);
check('sheet row starts with when it arrived', sheetPost.columns[0] === 'Received');
check('sheet columns and values line up',
  sheetPost.columns.length === sheetPost.values.length, sheetPost.columns.length + '/' + sheetPost.values.length);

const cell = (name) => sheetPost.values[sheetPost.columns.indexOf(name)];
check('sheet row keeps the applicant', cell('Full Name') === 'Pepito Perez', cell('Full Name'));
check('sheet row formats the date of birth', cell('Date of Birth') === 'February 2, 1990', cell('Date of Birth'));
check('sheet row records a ticked declaration as Yes', cell('Certified Accurate') === 'Yes');
check('sheet row records an unticked one as No',
  cell('Accepted SMS and WhatsApp') === 'No', cell('Accepted SMS and WhatsApp'));
check('sheet row keeps empty optional fields as columns',
  sheetPost.columns.indexOf('Resume Link') !== -1 && cell('Resume Link') === '');

sheetPost = null;
r = await worker.fetch(post(REVIEW), SHEET_ENV);
check('reviews go to their own tab', sheetPost.tab === 'Reviews', sheetPost.tab);
sheetPost = null;
r = await worker.fetch(post(CONTACT), SHEET_ENV);
check('contact requests go to their own tab', sheetPost.tab === 'Contact Requests', sheetPost.tab);

// A spreadsheet that missed a row must never cost someone their application.
sheetFails = true; sent = null; sheetPost = null;
r = await worker.fetch(post(APP), SHEET_ENV);
check('a broken sheet does not fail the submission', r.status === 200, r.status);
check('and the email still went', sent !== null && sent.body.subject.includes('Pepito Perez'));
sheetFails = false;

// Without the setting there is no sheet call at all.
sheetPost = null;
r = await worker.fetch(post(APP), ENV);
check('no sheet configured means no sheet call', r.status === 200 && sheetPost === null);

t = await selftest(SHEET_ENV, () => new Response(
  '{"message":"This API key is restricted to only send emails"}', { status: 401 }));
check('selftest reports the sheet is wired up',
  t.out.sheet.configured === true && t.out.sheet.tokenSet === true, JSON.stringify(t.out.sheet));

// 14 — address lookup
const PLACES_ENV = { ...ENV, GOOGLE_PLACES_KEY: 'AIza-test-key' };
const places = (path, payload, env, origin) => worker.fetch(new Request(
  'https://nixora-forms.workers.dev' + path, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', Accept: 'application/json',
               ...(origin === null ? {} : { Origin: origin || 'https://www.nixoraservices.com' }) }
  }), env);

placesCall = null;
r = await places('/places/suggest', { input: '10 Market', sessionToken: 'tok-1' }, PLACES_ENV);
let out = await r.json();
check('suggest answers 200', r.status === 200, r.status);
check('suggest returns the street line',
  out.suggestions[0].line === '10 Market St', JSON.stringify(out.suggestions));
check('suggest returns the city context',
  out.suggestions[0].context === 'St. Louis, MO, USA');
check('suggest limits results to the US', placesCall.body.includedRegionCodes[0] === 'us');
check('suggest passes the session token', placesCall.body.sessionToken === 'tok-1');
check('the key goes in the header, never the page',
  placesCall.headers['X-Goog-Api-Key'] === 'AIza-test-key');

placesCall = null;
r = await places('/places/suggest', { input: '10' }, PLACES_ENV);
out = await r.json();
check('a short query never reaches Google', placesCall === null && out.suggestions.length === 0);

placesCall = null;
r = await places('/places/details', { placeId: 'p1', sessionToken: 'tok-1' }, PLACES_ENV);
out = await r.json();
check('details splits the address into the form fields',
  out.address.street === '10 Market St' && out.address.city === 'St. Louis' &&
  out.address.state === 'MO' && out.address.zip === '63101', JSON.stringify(out.address));
check('details asks only for the address fields',
  placesCall.headers['X-Goog-FieldMask'] === 'addressComponents,formattedAddress');
check('details reuses the session token so it bills as one lookup',
  placesCall.url.includes('sessionToken=tok-1'), placesCall.url);

// A failure must cost a convenience, never the ability to type an address.
placesFails = true;
r = await places('/places/suggest', { input: '10 Market' }, PLACES_ENV);
out = await r.json();
check('a Google failure still answers 200', r.status === 200, r.status);
check('with an empty list rather than an error', Array.isArray(out.suggestions) && out.suggestions.length === 0);
check('and reports why for whoever is looking', /API key not valid/.test(out.detail || ''), out.detail);
placesFails = false;

placesCall = null;
r = await places('/places/suggest', { input: '10 Market' }, ENV);
out = await r.json();
check('no key configured means no lookup', placesCall === null && out.configured === false);

r = await places('/places/suggest', { input: '10 Market' }, PLACES_ENV, 'https://evil.example');
check('another site cannot spend the Maps quota', r.status === 403, r.status);

r = await worker.fetch(new Request('https://nixora-forms.workers.dev/places/suggest',
  { method: 'GET' }), PLACES_ENV);
check('GET on the lookup is refused', r.status === 405, r.status);

t = await selftest(PLACES_ENV, () => new Response(
  '{"message":"This API key is restricted to only send emails"}', { status: 401 }));
check('selftest reports the address lookup is wired up', t.out.places.configured === true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
