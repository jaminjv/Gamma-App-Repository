# Nixora Services LLC — Website

Static marketing site for **Nixora Services LLC**, a specialized commercial cleaning
staffing company. Built as plain HTML/CSS/JS — no build step, no framework, no
dependencies — so it can be hosted anywhere and edited by anyone.

## Sections

| Section | Anchor | What it covers |
|---|---|---|
| Hero | `#top` | Positioning, primary calls to action, key stats |
| About Us | `#about` | Company overview, plus the mission and vision |
| CEO | `#leadership` | Junior Cabrera, Chief Executive Officer |
| Home city | `#locale` | The Gateway Arch band — the company is based in St. Louis |
| How We Staff | `#process` | The 5 recruiting channels and the 9-step vetting process |
| Apply | `#careers` → `apply.html` | Two open positions: **Regular Cleaning** and **Green Team Associate (Waste Room)** |
| Services | `#services` | Pressure Washing, Green Team (waste classification), Regular Cleaning, Event & Industrial Staffing |
| Feedback | `#feedback` | Client and crew reviews + a "leave a review" form |
| Contact Us | `#contact` | Contact details, social links, enquiry form |
| Team Access | `team.html` | Staff shortcuts into Google Workspace — linked discreetly from the footer |

## Files

```
index.html          Home page (all sections)
apply.html          Job application form (pre-selects the role via ?role=)
thank-you.html      Post-submission confirmation page
team.html           Staff-only shortcuts into Google Workspace (noindex)
assets/css/styles.css   All styling (design tokens at the top)
assets/js/main.js       Navigation, scroll reveal, form handling
assets/img/             Logo lockup (light + dark), wave mark, social-share image
robots.txt, sitemap.xml SEO
.nojekyll               Tells GitHub Pages to serve files as-is
.github/workflows/deploy.yml   Auto-deploy to GitHub Pages on push to main
worker/             Cloudflare Worker that emails the form submissions (see worker/README.md)
```

---

## Before going live — things to replace

These are placeholders. Search for them and swap in the real values.

| Placeholder | Where | Replace with |
|---|---|---|
| `info@nixoraservices.com` | `index.html`, `assets/js/main.js` | Real company email |
| `facebook.com/nixoraservices` etc. | `index.html` (contact + footer) | Real Facebook / Instagram / LinkedIn URLs |
| Review quotes | `index.html`, `#feedback` | Real customer reviews. The three on the page are marked **Sample** and sit under a `.sample-note` banner. When real ones arrive, replace the quotes and delete the banner, every `tag--sample` badge, and the `.sample-note` / `.tag--sample` CSS block. |

### The forms

All three forms — contact, review and job application — post to the same
Formspree endpoint, `https://formspree.io/f/xppzzana`. Submissions are told
apart by a hidden `_subject` field, so one endpoint covers all three:

Each `_subject` field carries a `data-subject-template`, and the submit handler
fills it from the form's own values so the inbox shows who wrote in rather than
which form they used:

| Form | Subject line |
|---|---|
| Contact | `Laura Gomez — new service request` |
| Review | `Carlos Ruiz left a 4-star review` |
| Job application | `Pepito Perez applied — Green Team Associate (Waste Room)` |

Placeholders name form fields: `{Full Name} applied — {Position Applied For}`.
If any placeholder resolves empty the static `value` is sent instead, so a
missing name never produces a subject that opens with a dash. Edit the wording
in the HTML; the script needs no changes.

For Gmail filters, match on the wording that does not vary — `applied —` for
applications, `new service request` for enquiries — since the name now leads.

Field `name` attributes are written as readable labels — `Full Name`, not
`full_name` — because Formspree prints the name attribute as the label in the
notification email. `email` and `name` keep their lowercase keys: Formspree
special-cases those two for the reply-to address and the sender name.

Two behaviours worth knowing. Each form carries a `_gotcha` honeypot, which
Formspree treats as a spam signal and which the page also checks itself. And
if Formspree is unreachable the submission is **not** silently lost: the
message stays in the fields, the button re-enables, and the visitor is told to
email `info@nixoraservices.com` directly.

`assets/js/main.js` still keeps a `YOUR_FORM_ID` guard. It is deliberate: if a
form is ever duplicated without an endpoint, that form falls back to opening
the visitor's mail client instead of posting into nothing.

### Replacing Formspree — `worker/`

Formspree's free tier caps out at 50 submissions a month, cannot lay the
notification out in Nixora's own design, and sends from its own servers.
`worker/` is a Cloudflare Worker that does all three: it receives the same
three forms, renders the branded email in `worker/src/email.js` and sends it
through Resend from `notifications@nixoraservices.com`.

It is written and tested but **not yet live** — the forms still post to
Formspree. Switching over is two steps, both in `worker/README.md`: deploy the
Worker, then replace the `action` on the three forms with the endpoint it
prints. Nothing in `assets/js/main.js` changes; the Worker accepts the same
POST the page already makes, and answers the same way.

---

## The application form

The application is signed by typing a full legal name, stamped with the date
the form was submitted rather than the date the page loaded.

It was a drawn canvas signature first. That works, but Formspree's free tier
sends every field as plain text, so the drawing arrived as roughly 8 KB of
base64 in the middle of the notification. A typed name carries the same weight
under the federal E-SIGN Act — intent plus an unambiguous act of signing — and
it keeps the email readable. A drawn or wet signature belongs at onboarding,
alongside the I-9 and W-4, not on a public application form.

**Two fields were asked for and deliberately left out: Social Security number
and a work-permit photo upload.** Both would have gone to Formspree and landed
in an email inbox in plain text. File uploads are not on Formspree's free tier
at all, so an upload button would have looked functional and silently dropped
the document. See the note in the commit history before adding either.

---

## Team Access

`team.html` holds shortcuts into the company's Google Workspace, linked from the
footer rather than the navigation since it is for staff, not visitors. It is
marked `noindex, nofollow` and left out of `sitemap.xml`.

The tiles point at the domain-scoped Workspace URLs —
`mail.google.com/a/nixoraservices.com` and the same pattern for Drive and
Calendar — which land on the sign-in for that domain rather than a personal
Google account.

**The page never collects a password.** Gmail cannot be embedded in any case:
Google serves `X-Frame-Options` and a `frame-ancestors` policy that block the
inbox from loading in a third-party frame. But the more important reason is
that a login form on a marketing site is shaped exactly like a phishing page
and teaches staff the wrong habit. Every tile hands off to Google, and the page
carries a standing note saying so.

---

## Brand assets

The palette is taken directly from the Nixora logo, so the site and the logo
stay in step.

| Token | Value | Where it comes from |
|---|---|---|
| `--brand-600` | `#054a8b` | The blue of the Nixora wordmark |
| `--accent-500` | `#90c02d` | The lime of the wave above the "o" |
| `--accent-600` | `#57741b` | Darkened lime, for text and icons |
| `--accent-700` | `#60801e` | Darkened lime, for backgrounds under white text |
| `--on-tint` | `#054a8b` / `#86c2f5` | Foreground for links, icons and eyebrows — light / dark |
| `--on-accent` | `#57741b` / `#b7dc63` | Foreground for lime accents — light / dark |
| `--star` | `#d9922c` | Rating stars only — a semantic colour, not part of the brand |

Both brand values are sampled straight out of the vector artwork, so the site
and the logo match exactly. Everything else in `assets/css/styles.css` derives
from those two hues, and the neutrals are tinted toward the navy.

The lime is the brand's accent but cannot be used directly: white text on
`#90c02d` measures 2.2:1 and the lime on its own tint is 3.8:1, so both fail
AA. `--accent-500` is therefore decorative only — the logo and small fills —
while `--accent-600` (4.7:1 on the lime tint) carries text and icons and
`--accent-700` (4.6:1 under white) carries backgrounds such as the Green Team
card header.

`--brand-600` is dark enough to carry white button text, which makes it
unreadable as a *foreground* on a dark background. `--on-tint` is the separate
token for text and icons, and it flips light in dark mode. `--on-accent` does
the same job for the lime, which has the mirrored problem: `--accent-600` is
dark enough for a light tint and invisible on a dark one. To rebrand, edit the
`:root` token block at the top of the stylesheet — no other file needs to
change.

### The St. Louis band

The section under the hero is a full-bleed photograph of the Gateway Arch over
the downtown skyline, served at two widths through `srcset`.

The arch crown sits about 2% from the photo's top edge, so
`object-position: 50% 0` anchors the image to the top — any vertical crop from
the centre decapitates the monument.

There is deliberately **no gradient and no mask** anywhere in this band. The
ground is flat `#011c34` and the photograph sits over it at a constant 32%
opacity, so the image works as texture and the copy sits on a background that
never changes tone.

Two gradient versions were tried and both failed the same way: any directional
fade — an overall scrim, or a mask splitting copy from photo — reads as a
visible seam running through the band. A single even layer has no edge to
notice. Measured contrast of the body text against the lightest point of the
background behind it is 5.9:1, against the 4.5:1 that AA asks for, so the
opacity has some room to move if the image should read stronger.

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

`favicon.svg` is the logo's green wave on a blue plate, in a **square**
viewBox. The square matters: browsers letterbox or squash a non-square favicon.
The plate gives the icon a solid silhouette at 16 px and keeps the lime legible,
which it would not be on a light tab bar on its own.

`favicon.ico` sits at the **site root**, not in `assets/`, and that location
matters: browsers request `/favicon.ico` on their own whatever the `<link>`
tags say, and when the request 404s many of them keep showing whichever icon
they already had cached. It carries 16, 32, 48 and 64 px so bookmarks, tabs
and the OS each get a size they can use.

`apple-touch-icon.png` (180 px) is the iOS home-screen icon.

The SVG and touch-icon links carry a `?v=` query. A cached favicon survives a
hard reload — the browser does not treat it like a page asset — but it cannot
survive a changed URL. Bump that number whenever the icon changes.

### Logo files

All vector, extracted from the supplied artwork.

| File | Use |
|---|---|
| `nixora-logo.svg` | The lockup — header, footer and thank-you page |
| `nixora-mark.svg` | The green wave alone, transparent |
| `favicon.svg` | The green wave on a blue plate, square — browser tab |
| `../favicon.ico` | Multi-resolution 16/32/48/64 icon at the **site root** |
| `apple-touch-icon.png` | 180px iOS home-screen icon |
| `og-cover.png` | 1200×630 social share card |

### How the logo handles dark mode

On dark backgrounds the word **Nixora** turns white and **SERVICES** lightens
to `#b9c2cc`, because its `#6d6d6d` grey goes muddy against the dark ground.
The green wave never changes.

Two parts recolour independently, which `currentColor` alone cannot do. Custom
properties can: they inherit into the shadow tree that `<use>` creates, so the
paths reference `var(--logo-word)` and `var(--logo-sub)` and the theme sets
both on the host element:

```css
.brand__logo { --logo-word: #054a8b; --logo-sub: #6d6d6d; }
:root[data-theme="dark"] .brand__logo { --logo-word: #fff; --logo-sub: #b9c2cc; }
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
handling, which would replace the Formspree step above — as does the Worker in
`worker/`, which runs on Cloudflare regardless of where the pages are served.
