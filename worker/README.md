# Nixora Forms — Cloudflare Worker

Receives the three forms on the Nixora Services site, renders a branded
notification and sends it through [Resend](https://resend.com).

It replaces Formspree, which could not do three things the site needed: a
subject line built from the submission, an email laid out in Nixora's own
design, and a sending address on `nixoraservices.com`.

| | Formspree (free) | This Worker |
|---|---|---|
| Submissions | 50 / month | 100,000 / day (Cloudflare free tier) |
| Subject line | fixed per form | `Pepito Perez applied — Green Team Associate (Waste Room)` |
| Email layout | Formspree's table of raw field names | the Nixora template |
| Sent from | Formspree's servers | `notifications@nixoraservices.com` |
| Cost | $0 | $0 up to 3,000 emails/month, then $20/month |

## What it sends

Three notifications, one per form, all built from the same template:

| Form | Page | Subject |
|---|---|---|
| `application` | `apply.html` | `{Full Name} applied — {Position Applied For}` |
| `contact` | `index.html#contact` | `{name} — new service request` |
| `review` | `index.html#feedback` | `{name} left a {Rating}-star review` |

The form type comes from the hidden `_form` field when present, and is
otherwise worked out from the fields themselves, so a submission is never
lost to a markup slip.

`Reply` on an application or a contact message goes to the person who wrote
in, not to the Worker. Reviews carry no email address, so they have no
reply-to and the footer says so.

## Preview without deploying

```sh
node worker/scripts/preview.js /tmp/nixora-mail
```

Writes `application.html`, `contact.html` and `review.html` with sample data
and prints the subject line and plain-text part of each. Nothing is sent.

```sh
node worker/scripts/test.js
```

Runs the Worker against a stubbed Resend: routing, subjects, reply-to, the
honeypot, the origin allowlist, the no-script fallback and the failure paths.
Needs no API key and sends nothing. Pass a path to check the bundled build
behaves identically:

```sh
node worker/scripts/test.js ../dist/nixora-forms.js
```

## Deploying

Everything below happens in Junior's own Cloudflare and Resend accounts.
There are two routes: the browser, which needs nothing installed, and the
command line. Both deploy the same thing.

### 1. Verify the domain in Resend

1. Create the account at [resend.com](https://resend.com) and open
   **Domains → Add Domain**, entering `nixoraservices.com`.
2. Resend shows three records to create. Add them in the Squarespace DNS
   panel exactly as shown — typically:
   - `TXT` on `send` — the SPF record
   - `TXT` on `resend._domainkey` — the DKIM key
   - `MX` on `send` — the bounce path, priority 10
3. **Leave the existing MX records on the root domain alone.** Those carry
   Google Workspace mail; the Resend records sit on the `send` subdomain and
   do not collide with them.
4. Wait for Resend to show the domain as **Verified** — usually minutes, up
   to a few hours.
5. Under **API Keys**, create a key with *Sending access* and copy it. It is
   shown once.

### 2a. Deploy from the browser

No terminal, nothing to install. `dist/nixora-forms.js` is the whole Worker
flattened into one file for exactly this.

1. At [dash.cloudflare.com](https://dash.cloudflare.com), open **Compute
   (Workers) → Create → Start from Hello World! → Deploy**. Name it
   `nixora-forms`.
2. Open **Edit code**, select everything in the editor, and paste the contents
   of `dist/nixora-forms.js` over it. **Deploy**.
3. Under **Settings → Variables and Secrets**, add the settings from the table
   below as plaintext variables, and `RESEND_API_KEY` as a **Secret**. Deploy
   again so they take effect.

The Worker's URL is on its overview page, of the form
`https://nixora-forms.<your-subdomain>.workers.dev`.

Rebuild the single file after changing anything under `src/`:

```sh
node worker/scripts/bundle.js
```

### 2b. Deploy from the command line

Needs [Node.js](https://nodejs.org) installed.

```sh
cd worker
npm install
npx wrangler login
npx wrangler secret put RESEND_API_KEY   # paste the key from step 1
npx wrangler deploy
```

`wrangler deploy` reads `wrangler.toml`, so the settings are applied for you.
It prints the endpoint when it finishes.

### 3. Point the site at it

Replace the `action` on the three forms with that URL:

- `apply.html` — the application form
- `index.html` — the review form and the contact form

Nothing else on the site changes: `assets/js/main.js` already posts the form
with `fetch` and shows the existing success and error states.

## Address suggestions

With `GOOGLE_PLACES_KEY` set, typing in the application form's street field
offers matching US addresses, and picking one fills the street, city, state
and ZIP together.

**The key never reaches the page.** The browser asks this Worker, and the
Worker asks Google, so the key sits as a secret beside the Resend one rather
than in the page source where anyone could read it out of view-source and
spend the company's Maps quota. It also keeps Google's script off the site:
nothing third-party loads until somebody starts typing an address.

Two endpoints, both POST and both behind the same origin allowlist as the
forms:

| Path | Does |
|---|---|
| `/places/suggest` | `{input, sessionToken}` → up to five matching addresses |
| `/places/details` | `{placeId, sessionToken}` → street, city, state, ZIP |

The page sends one session token through the typing and the pick that follows,
which Google bills as a single lookup rather than one per keystroke. Queries
under four characters never leave the Worker.

### Setting it up

1. In [Google Cloud Console](https://console.cloud.google.com), create a
   project and enable **Places API (New)**. Billing has to be on, though the
   monthly free tier covers this volume many times over.
2. **APIs & Services → Credentials → Create credentials → API key.**
3. Restrict it: **API restrictions → Places API (New)**. An application
   restriction is not needed and not useful here — the key is used from the
   Worker, which has no fixed IP and sends no referrer. What protects it is
   that it never leaves Cloudflare.
4. Add it to the Worker as `GOOGLE_PLACES_KEY`, a **Secret**. Deploy.

Leave it unset and the field is an ordinary text box. Everything about this is
an enhancement over one: if Google is down, the key is wrong or the quota is
spent, no list appears, the Worker answers with an empty one, and the
applicant types their address exactly as before. A failure here costs a
convenience and never an application.

## Sending every submission to a spreadsheet

Set `SHEET_WEBHOOK_URL` and the Worker posts a copy of each submission to a
Google Sheet as well as emailing it, so there is a running table to sort,
filter and export to Excel (`File → Download → Microsoft Excel (.xlsx)`).

Each form gets its own tab — **Applications**, **Contact Requests**,
**Reviews** — and the header row grows when a new field appears, so adding a
field to the site later means a new column rather than a broken import.

### Setting it up

1. Create a spreadsheet in the company Google Workspace. Name it something
   like *Nixora — Form Submissions*.
2. **Extensions → Apps Script**. Delete what is there and paste
   `google-apps-script.gs` from this folder.
3. Replace `PUT-THE-SAME-TOKEN-HERE` with a long random string. Save.
4. **Deploy → New deployment → Web app**, with *Execute as* **Me** and *Who
   has access* **Anyone**. Copy the URL it gives you, ending in `/exec`.
5. On the Worker, add `SHEET_WEBHOOK_URL` (that URL) and `SHEET_TOKEN` (the
   same random string, as a **Secret**). Deploy.

"Anyone" sounds alarming and is why the token exists: the Web App URL is
reachable by anyone who has it, and the token is what stops them writing rows
into the company's hiring records. It is checked before anything is written.

Leaving `SHEET_WEBHOOK_URL` empty turns the spreadsheet off. The email is
unaffected either way.

### What happens when the sheet is down

The email is sent first, and a failure to append is logged and reported
through `/selftest` rather than shown to the person who filled in the form. A
spreadsheet that missed a row is worth knowing about; it is not worth failing
a job application over.

### Checking it

```sh
node worker/scripts/test-apps-script.js
```

Runs the Apps Script against a fake spreadsheet: the token, the header
growing, an older row keeping its meaning when a column is added, a missing
field leaving an empty cell rather than shifting the row, and text that would
otherwise be executed as a formula being pinned to text.

## Settings

`wrangler.toml` holds everything except the API key.

| Variable | What it does |
|---|---|
| `SITE_URL` | Site root. Used for the logo, the links in the email, and the redirect after a no-JavaScript submission |
| `FROM_EMAIL` | Sending identity. The domain must be verified in Resend |
| `TO_EMAIL` | Default inbox |
| `TO_APPLICATIONS`, `TO_CONTACT`, `TO_REVIEWS` | Optional per-form inboxes. Remove one to fall back to `TO_EMAIL` |
| `ALLOWED_ORIGINS` | Comma-separated list of sites allowed to post. Anything else is refused, so the endpoint cannot be used as a free mailer |
| `GOOGLE_PLACES_KEY` | **Secret**. Places API (New) key for the address suggestions. Unset turns them off |
| `SHEET_WEBHOOK_URL` | Apps Script Web App URL. Empty turns the spreadsheet off |
| `SHEET_TOKEN` | **Secret**. Must match `SHARED_TOKEN` in `google-apps-script.gs` |
| `RESEND_API_KEY` | **Secret**, never in this file. Set with `wrangler secret put`, or as a Secret under Settings → Variables and Secrets |

After changing `wrangler.toml`, run `npx wrangler deploy` again. On the browser
route the same settings are entered in the dashboard instead, and
`wrangler.toml` is only the reference for what they should be.

## Spam handling

- **Honeypot** — the `_gotcha` field is hidden from people. Anything that
  fills it gets a `200` and is dropped, so the bot never learns it was caught.
- **Origin allowlist** — a post from an origin outside `ALLOWED_ORIGINS` is
  refused with `403`.
- **Size limit** — bodies over 128 KB are rejected.
- For a hard ceiling, add a rate-limiting rule in the Cloudflare dashboard
  (**Security → WAF → Rate limiting rules**); the free plan includes one.

## Which version is live

Open the Worker's URL in a browser. It refuses the GET, and says which build
answered:

```json
{"ok": false, "error": "Send this form with POST.", "build": "2026-09-02.5", …}
```

Compare that against `BUILD` at the top of `src/index.js`. Deploying through
the dashboard editor is easy to get wrong in a way that silently leaves the
previous version running, and without this there is nothing to tell you: the
old build answers every request perfectly well, just as its older self.

Bump `BUILD` whenever `src/` changes.

## Checking the settings — `/selftest`

Open the Worker's URL with `/selftest` on the end in a browser:

```
https://<your-worker>.workers.dev/selftest
```

It sends nothing. It reports what is configured, asks Resend whether it
accepts the key, and checks that the domain in `FROM_EMAIL` is one Resend
lists as verified — then says which of those is wrong in a `verdict` line.

```json
{
  "settings": { "FROM_EMAIL": "Nixora Services <notifications@nixoraservices.com>", … },
  "key": { "present": true, "length": 36, "startsWithRe": true },
  "resend": { "status": 200, "domains": [{ "name": "nixoraservices.com", "status": "verified" }] },
  "verdict": "All good. The key works and nixoraservices.com is verified for sending."
}
```

It describes the key — present, length, plausible prefix — and never echoes
it. The addresses it does print are the ones already published on the site.

A key scoped to sending only cannot read the domain list, and Resend refuses
it with a 401 saying so. That refusal is the correct answer for this endpoint:
it proves the key is real and scoped exactly as it should be, so the verdict
reports it as such rather than as a broken key. Domain verification then has
to be read in the Resend dashboard instead.

Reach for this before the logs: a rejected send is nearly always one of the
three things it checks, and this is a URL rather than a log console.

### `/selftest?send=1`

When everything readable is correct and the send still fails, add `?send=1`.
It posts one real message to `TO_EMAIL` and reports Resend's answer verbatim:

```json
{"send": {"ok": false, "status": 403, "message": "The nixoraservices.com domain is not verified"},
 "verdict": "Resend refused the send: The nixoraservices.com domain is not verified"}
```

The recipient is always the configured one and never comes from the request,
so this cannot be pointed at anybody else. It is still a public URL that sends
mail to that inbox, though — worth deleting the `options.send` branch once the
endpoint is working, if that matters.

## Watching it run

```sh
npx wrangler tail
```

Streams live logs. Failures are logged with the reason Resend gave, and the
site shows its own error message pointing at `info@nixoraservices.com`, so a
submission is never silently lost.

## Layout

```
worker/
  src/index.js          request handling, CORS, honeypot, Resend call
  src/forms.js          field names for the three forms → a render spec
  src/places.js         address lookup, proxied so the Google key stays secret
  src/email.js          the HTML and plain-text template
  scripts/preview.js    renders samples locally, sends nothing
  scripts/test.js       exercises the Worker with the Resend call stubbed
  scripts/test-apps-script.js  runs the Apps Script against a fake spreadsheet
  google-apps-script.gs  paste this into the destination spreadsheet
  scripts/bundle.js     flattens src/ into dist/ for the browser route
  dist/nixora-forms.js  generated single file — edit src/, not this
  wrangler.toml         settings
```

Field names live in one place, at the top of `src/forms.js`. Renaming a field
on the site is a one-line change there.
