/* ==========================================================================
   Nixora Services LLC — address verification without an account.

   Two free public services, neither of which needs a key, a project or a
   card:

     · the US Census Bureau geocoder, for checking that a street address
       exists and getting its standardised form
     · Zippopotam, for turning a ZIP code into a city and state

   This is the fallback for Google Places, and it also runs alongside it:
   Places suggests while someone types, this checks what they ended up with.
   Both are conveniences. Every failure here answers "unknown" rather than an
   error, so an unreachable service costs a hint and never an application.
   ========================================================================== */

const CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const ZIPS = 'https://api.zippopotam.us/us/';

/* The Census answers in capitals — "10 MARKET ST, SAINT LOUIS, MO". Shouting
   an address back at someone reads like a correction even when it is not, so
   it is title-cased before it is shown. */
const KEEP_UPPER = ['NE', 'NW', 'SE', 'SW', 'N', 'S', 'E', 'W', 'US', 'PO'];

export function titleCase(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\b[a-z']+\b/g, (word) => word.charAt(0).toUpperCase() + word.slice(1))
    .split(' ')
    .map((word) => (KEEP_UPPER.indexOf(word.toUpperCase()) !== -1 ? word.toUpperCase() : word))
    .join(' ');
}

const withTimeout = (ms) => {
  // A slow public service must not hold up the form. AbortSignal.timeout is
  // not everywhere yet, so the controller is wired by hand.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
};

export async function lookupZip(zip) {
  const clean = String(zip || '').trim().slice(0, 5);
  if (!/^\d{5}$/.test(clean)) return { found: false };

  const t = withTimeout(4000);
  try {
    const response = await fetch(ZIPS + clean, { signal: t.signal });
    if (!response.ok) return { found: false };

    const data = await response.json();
    const place = (data.places || [])[0];
    if (!place) return { found: false };

    return {
      found: true,
      city: place['place name'] || '',
      state: place['state abbreviation'] || ''
    };
  } catch (error) {
    return { found: false };
  } finally {
    t.done();
  }
}

export async function verifyAddress({ street, city, state, zip }) {
  const line = [street, [city, state].filter(Boolean).join(', '), zip]
    .filter(Boolean).join(', ').trim();
  if (!street || line.length < 8) return { checked: false };

  const url = CENSUS + '?address=' + encodeURIComponent(line) +
    '&benchmark=Public_AR_Current&format=json';

  const t = withTimeout(6000);
  try {
    const response = await fetch(url, { signal: t.signal });
    if (!response.ok) return { checked: false };

    const data = await response.json();
    const match = (((data.result || {}).addressMatches) || [])[0];

    // No match is not "wrong". New construction, rural routes and recently
    // renumbered streets are all missing from the file, so this reports that
    // it could not confirm rather than that the address is bad.
    if (!match) return { checked: true, verified: false };

    const parts = match.addressComponents || {};
    const number = [parts.fromAddress].filter(Boolean).join('');
    const streetName = [parts.preDirection, parts.preType, parts.streetName,
      parts.suffixType, parts.suffixDirection].filter(Boolean).join(' ');

    return {
      checked: true,
      verified: true,
      address: {
        street: titleCase([number, streetName].filter(Boolean).join(' ')),
        city: titleCase(parts.city || ''),
        state: (parts.state || '').toUpperCase(),
        zip: parts.zip || '',
        formatted: titleCase(match.matchedAddress || '')
          .replace(/\b([a-z]{2}),/i, (m, s) => s.toUpperCase() + ',')
      }
    };
  } catch (error) {
    return { checked: false };
  } finally {
    t.done();
  }
}
