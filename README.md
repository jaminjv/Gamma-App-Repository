# Nixora Services LLC — Website

Static marketing site for **Nixora Services LLC**, a specialized commercial cleaning
staffing company. Built as plain HTML/CSS/JS — no build step, no framework, no
dependencies — so it can be hosted anywhere and edited by anyone.

## Sections

| Section | Anchor | What it covers |
|---|---|---|
| Hero | `#top` | Positioning, primary calls to action, key stats |
| About Us | `#about` | Company overview, 5 recruiting channels, the 9-step vetting process |
| Apply | `#careers` → `apply.html` | Two open positions: **House Keeping** and **Green Team Associate** |
| Services | `#services` | Pressure Washing, Green Team (waste classification), House Keeping, Event & Industrial Staffing |
| Feedback | `#feedback` | Client and crew reviews + a "leave a review" form |
| CEO | `#leadership` | Junior, Chief Executive Officer |
| Contact Us | `#contact` | Contact details, social links, enquiry form |

## Files

```
index.html          Home page (all sections)
apply.html          Job application form (pre-selects the role via ?role=)
thank-you.html      Post-submission confirmation page
assets/css/styles.css   All styling (design tokens at the top)
assets/js/main.js       Navigation, scroll reveal, form handling
assets/img/             Logo mark and social-share image
robots.txt, sitemap.xml SEO
.nojekyll               Tells GitHub Pages to serve files as-is
.github/workflows/deploy.yml   Auto-deploy to GitHub Pages on push to main
```

---

## Before going live — things to replace

These are placeholders. Search for them and swap in the real values.

| Placeholder | Where | Replace with |
|---|---|---|
| `www.nixoraservices.com` | `index.html`, `apply.html`, `robots.txt`, `sitemap.xml` | Your real domain |
| `info@nixoraservices.com` | `index.html`, `assets/js/main.js` | Real company email |
| `+1 (000) 000-0000` / `tel:+10000000000` | `index.html` | Real phone number |
| `YOUR_FORM_ID` | the three `<form action="…">` tags | Your Formspree form ID (see below) |
| `facebook.com/nixoraservices` etc. | `index.html` (contact + footer) | Real Facebook / Instagram / LinkedIn URLs |
| CEO photo | `index.html`, `.ceo__portrait` block | `<img src="assets/img/ceo-junior.jpg" alt="Junior, CEO">` |
| Review quotes | `index.html`, `#feedback` | Real customer reviews |

### Making the forms actually send email

The three forms (contact, review, job application) post to
[Formspree](https://formspree.io) — free tier, works on static hosting.

1. Create an account and a form at formspree.io.
2. Copy the form endpoint (looks like `https://formspree.io/f/abcdwxyz`).
3. Replace all occurrences of `https://formspree.io/f/YOUR_FORM_ID`.

Until that is done the forms fall back to opening the visitor's email client
addressed to `info@nixoraservices.com`, so the site is still usable on day one.

---

## Publishing on your Squarespace domain

Squarespace hosting cannot serve custom HTML. The approach here is:
**keep the domain registered at Squarespace, host the site on GitHub Pages,
and point the DNS records at GitHub.**

### Step 1 — Enable GitHub Pages

1. Repository → **Settings** → **Pages**.
2. **Source**: `GitHub Actions`.
3. Push to `main`. The included workflow publishes the site automatically.
4. Confirm it works at `https://<user>.github.io/<repo>/` before touching DNS.

### Step 2 — Add the custom domain in GitHub

1. Settings → **Pages** → **Custom domain** → enter `www.yourdomain.com` → **Save**.
   GitHub commits a `CNAME` file to the repo for you.
2. Leave **Enforce HTTPS** unchecked for now — enable it after DNS resolves
   (the certificate can take up to 24 hours to issue).

### Step 3 — Update DNS in Squarespace

Squarespace panel → **Domains** → select your domain → **DNS** → **DNS Settings**
(or *Advanced Settings* → *Custom Records*, depending on the panel version).

Remove the default Squarespace `A` records for `@` and the `www` `CNAME` that
points to `ext-cust.squarespace.com`, then add:

**Apex domain (`yourdomain.com`) — four A records**

| Host | Type | Value |
|---|---|---|
| `@` | A | `185.199.108.153` |
| `@` | A | `185.199.109.153` |
| `@` | A | `185.199.110.153` |
| `@` | A | `185.199.111.153` |

**Optional IPv6 — four AAAA records**

| Host | Type | Value |
|---|---|---|
| `@` | AAAA | `2606:50c0:8000::153` |
| `@` | AAAA | `2606:50c0:8001::153` |
| `@` | AAAA | `2606:50c0:8002::153` |
| `@` | AAAA | `2606:50c0:8003::153` |

**www subdomain — one CNAME**

| Host | Type | Value |
|---|---|---|
| `www` | CNAME | `<your-github-username>.github.io` |

> Do **not** add a trailing dot or the repository name to the CNAME value.

### Step 4 — Wait, then verify

DNS propagation usually takes 15 minutes to a few hours (up to 48 in the worst
case). Check with:

```bash
dig +short www.yourdomain.com
dig +short yourdomain.com
```

When the GitHub IPs come back, return to Settings → Pages and tick
**Enforce HTTPS**.

### Important notes

- If the domain is currently attached to a live Squarespace *site*, changing these
  records takes that site offline. Make sure that is intended.
- Keep the Squarespace **nameservers** as they are — you are only editing records,
  not transferring the domain.
- Email records (`MX`, `TXT`/SPF, DKIM) must stay untouched, otherwise company
  email stops working.

---

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Alternative hosts

The same files deploy as-is to Netlify, Vercel or Cloudflare Pages — drag the
folder in or connect the repo. Netlify and Cloudflare also provide built-in form
handling, which would replace the Formspree step above.
