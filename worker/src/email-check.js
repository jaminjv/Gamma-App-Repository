/* ==========================================================================
   Nixora Services LLC — is this address able to receive mail at all?

   Two free checks, in order of certainty:

     · the domain has MX records, so mail sent there has somewhere to go
     · the domain is not a near-miss of a common one (gmial.com, hotmial.com)

   Neither proves the mailbox exists. Nothing does, short of sending to it or
   paying a verification service — so this catches the mistyped domain, which
   is where most bounces come from, and says nothing about the part before
   the @.
   ========================================================================== */

const DOH = 'https://cloudflare-dns.com/dns-query';

/* Domains people mean, and the misspellings that reach them as bounces.
   Only near-misses of addresses that are typed thousands of times a day —
   a general-purpose spell checker would start "correcting" real domains. */
const COMMON = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'live.com', 'icloud.com', 'me.com', 'aol.com', 'comcast.net', 'att.net',
  'sbcglobal.net', 'verizon.net', 'msn.com', 'protonmail.com'
];

/* Levenshtein, bounded: anything more than two edits away is a different
   domain rather than a typo of this one. */
function editDistance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  let previous = Array.from({ length: b.length + 1 }, (unused, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (current[j] < best) best = current[j];
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

export function suggestDomain(domain) {
  const clean = String(domain || '').toLowerCase();
  if (!clean || COMMON.indexOf(clean) !== -1) return '';

  for (const candidate of COMMON) {
    if (editDistance(clean, candidate, 2) <= 2) return candidate;
  }
  return '';
}

export async function checkEmail(address) {
  const value = String(address || '').trim().toLowerCase();
  const match = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(value);
  if (!match) return { checked: false };

  const domain = match[1];
  const suggestion = suggestDomain(domain);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(
      DOH + '?name=' + encodeURIComponent(domain) + '&type=MX',
      { headers: { accept: 'application/dns-json' }, signal: controller.signal }
    );
    if (!response.ok) return { checked: false, suggestion };

    const data = await response.json();
    // Status 3 is NXDOMAIN: the domain itself does not exist.
    const exists = data.Status === 0;
    const mx = (data.Answer || []).filter((record) => record.type === 15);

    // Some domains take mail on the A record with no MX. Rare, and worth not
    // rejecting someone over, so it counts as deliverable.
    const hasMail = mx.length > 0 || (exists && !data.Answer);

    return {
      checked: true,
      domain,
      exists,
      deliverable: exists && (mx.length > 0 || hasMail),
      mxCount: mx.length,
      suggestion
    };
  } catch (error) {
    // A DNS lookup that did not answer is not evidence against the address.
    return { checked: false, suggestion };
  } finally {
    clearTimeout(timer);
  }
}
