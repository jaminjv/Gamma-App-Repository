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
assets/img/             Logo lockup (light + dark), wave mark, social-share image
robots.txt, sitemap.xml SEO
.nojekyll               Tells GitHub Pages to serve files as-is
.github/workflows/deploy.yml   Auto-deploy to GitHub Pages on push to main
```

---

## Before going live — things to replace

These are placeholders. Search for them and swap in the real values.

| Placeholder | Where | Replace with |
|---|---|---|
| `info@nixoraservices.com` | `index.html`, `assets/js/main.js` | Real company email |
| `+1 (000) 000-0000` / `tel:+10000000000` | `index.html` | Real phone number |
| `YOUR_FORM_ID` | the three `<form action="…">` tags | Your Formspree form ID (see below) |
| `facebook.com/nixoraservices` etc. | `index.html` (contact + footer) | Real Facebook / Instagram / LinkedIn URLs |
| CEO photo | `index.html`, `.ceo__portrait` block | `<img src="assets/img/ceo-junior.jpg" alt="Junior, CEO">` |
| Review quotes | `index.html`, `#feedback` | Real customer reviews. The three on the page are marked **Sample** and sit under a `.sample-note` banner. When real ones arrive, replace the quotes and delete the banner, every `tag--sample` badge, and the `.sample-note` / `.tag--sample` CSS block. |

### Making the forms actually send email

The three forms (contact, review, job application) post to
[Formspree](https://formspree.io) — free tier, works on static hosting.

1. Create an account and a form at formspree.io.
2. Copy the form endpoint (looks like `https://formspree.io/f/abcdwxyz`).
3. Replace all occurrences of `https://formspree.io/f/YOUR_FORM_ID`.

Until that is done the forms fall back to opening the visitor's email client
addressed to `info@nixoraservices.com`, so the site is still usable on day one.

---

## Brand assets

The palette is taken directly from the Nixora logo, so the site and the logo
stay in step.

| Token | Value | Where it comes from |
|---|---|---|
| `--brand-700` | `#012d54` | The navy of the NIXORA wordmark |
| `--accent-500` | `#29a155` | The green of SERVICES and the lower wave |
| `--on-tint` | `#01406f` / `#8ec2ea` | Foreground for links, icons and eyebrows — light / dark |
| `--star` | `#d9922c` | Rating stars only — a semantic colour, not part of the brand |

Both brand values are sampled straight out of the vector artwork, so the site
and the logo match exactly. Everything else in `assets/css/styles.css` derives
from those two hues, and the neutrals are tinted toward the navy.

`--brand-600` is dark enough to carry white button text, which makes it
unreadable as a *foreground* on a dark background. `--on-tint` is the separate
token for text and icons, and it flips light in dark mode. To rebrand, edit the
`:root` token block at the top of the stylesheet — no other file needs to
change.

### Theme

The site opens **light** for every first-time visitor, whatever the operating
system is set to, and a switch in the header flips it to dark. The choice is
saved in `localStorage` under `nixora-theme` and applies across all pages.

An inline script in each `<head>` stamps `data-theme` on `<html>` before the
stylesheet paints, so the page never flashes the wrong theme. With JavaScript
off, no stamp is written and the CSS falls back to the operating system
preference — and the switch hides itself, since it could not do anything.

To follow the operating system instead of defaulting to light, change the
fallback in that inline script from `'light'` to reading
`matchMedia('(prefers-color-scheme: dark)')`.

### Favicon

`favicon.svg` is the wave mark on a navy plate, cropped to a **square**
viewBox. The square matters: browsers letterbox or squash a non-square favicon,
which is why the earlier wide version rendered badly in the tab. The plate gives
the icon a solid silhouette at 16 px, where the wave alone dissolves.

`favicon-32.png` covers browsers that reject SVG favicons, and
`apple-touch-icon.png` (180 px) is the iOS home-screen icon.

### Logo files

All vector, extracted from the supplied artwork.

| File | Use |
|---|---|
| `nixora-logo.svg` | Horizontal lockup — header and footer |
| `nixora-logo-vertical.svg` | Stacked lockup — thank-you page, print, social profiles |
| `nixora-mark.svg` | Wave mark only, transparent — general use |
| `favicon.svg` | Wave on a navy plate, square — browser tab |
| `favicon-32.png` | 32px raster fallback |
| `apple-touch-icon.png` | 180px iOS home-screen icon |
| `og-cover.png` | 1200×630 social share card |

### How the logo handles dark mode

On dark backgrounds **only the word NIXORA turns white**; the wave and the word
SERVICES keep their original colours.

That rule is enforced without a second file. The NIXORA letterforms are filled
with `currentColor`, so the wordmark follows the CSS `color` of whatever
contains it, while every other path keeps its own fill:

```css
.brand__logo { color: var(--brand-700); }   /* navy */
:root[data-theme="dark"] .brand__logo { color: #fff; }
```

The pages inline the geometry once as an SVG `<symbol>` (`.brand-sprite`, just
after `<body>`) and reference it with `<use>`, so a page with the logo in both
the header and the footer carries the paths only once.

The standalone `.svg` files in this folder set `color="#012d54"` on the root
element, so they render correctly on their own — dropped into an email
signature, a document, or Squarespace. Use those, not the inline copies.

One note on the source artwork: it contained two red hairline slivers, roughly
1.8 × 1.7 units, tucked into the seam where the crescent meets the wave. They
are not a brand colour and read as a rendering defect at large sizes, so they
are omitted from these files. Everything else is untouched.

---

## Publishing on your Squarespace domain

Squarespace hosting cannot serve custom HTML. The approach here is:
**keep the domain registered at Squarespace, host the site on GitHub Pages,
and point the DNS records at GitHub.**

### Step 1 — Enable GitHub Pages

1. The repository must be **public**, unless the account has GitHub Pro.
   Pages is not available on private repositories on the free plan.
2. Repository → **Settings** → **Pages**.
3. **Source**: `GitHub Actions`. The workflow token cannot set this itself —
   the API returns `Resource not accessible by integration` — so it has to be
   done once by hand.
4. Push to `main`. The included workflow publishes the site automatically.
5. Confirm it works at `https://<user>.github.io/<repo>/` before touching DNS.

### Step 2 — Add the custom domain in GitHub

The repository already contains a `CNAME` file holding `www.nixoraservices.com`,
so Pages picks the domain up on deploy. Confirm it under Settings → **Pages** →
**Custom domain**.

Leave **Enforce HTTPS** unchecked until DNS resolves — the certificate can take
up to 24 hours to issue — then turn it on.

### Step 3 — Update DNS in Squarespace

Squarespace panel → **Domains** → select your domain → **DNS** → **DNS Settings**
(or *Advanced Settings* → *Custom Records*, depending on the panel version).

Remove the default Squarespace `A` records for `@` and the `www` `CNAME` that
points to `ext-cust.squarespace.com`, then add:

**Apex domain (`nixoraservices.com`) — four A records**

These make the bare domain redirect to `www`.

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
| `www` | CNAME | `jaminjv.github.io` |

> Do **not** add a trailing dot or the repository name to the CNAME value.

### Step 4 — Wait, then verify

DNS propagation usually takes 15 minutes to a few hours (up to 48 in the worst
case). Check with:

```bash
dig +short www.nixoraservices.com
dig +short nixoraservices.com
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
