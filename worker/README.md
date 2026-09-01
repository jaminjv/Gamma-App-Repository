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

## Settings

`wrangler.toml` holds everything except the API key.

| Variable | What it does |
|---|---|
| `SITE_URL` | Site root. Used for the logo, the links in the email, and the redirect after a no-JavaScript submission |
| `FROM_EMAIL` | Sending identity. The domain must be verified in Resend |
| `TO_EMAIL` | Default inbox |
| `TO_APPLICATIONS`, `TO_CONTACT`, `TO_REVIEWS` | Optional per-form inboxes. Remove one to fall back to `TO_EMAIL` |
| `ALLOWED_ORIGINS` | Comma-separated list of sites allowed to post. Anything else is refused, so the endpoint cannot be used as a free mailer |
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
  src/email.js          the HTML and plain-text template
  scripts/preview.js    renders samples locally, sends nothing
  scripts/test.js       exercises the Worker with the Resend call stubbed
  scripts/bundle.js     flattens src/ into dist/ for the browser route
  dist/nixora-forms.js  generated single file — edit src/, not this
  wrangler.toml         settings
```

Field names live in one place, at the top of `src/forms.js`. Renaming a field
on the site is a one-line change there.
