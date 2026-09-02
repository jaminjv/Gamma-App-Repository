/* ==========================================================================
   Nixora Services LLC — address autocomplete.

   The page never sees the Google key. It asks this Worker, and the Worker
   asks Google, which means the key lives as a secret next to the Resend one
   rather than in the page source where anyone can read it off a browser's
   view-source and spend the company's Maps quota.

   It also keeps Google's script off the site: no third-party JavaScript, and
   nothing loaded before someone actually starts typing an address.
   ========================================================================== */

const AUTOCOMPLETE = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS = 'https://places.googleapis.com/v1/places/';

/* Two calls made in the same session are billed as one lookup, so the page
   generates a token when someone starts typing and sends it back when they
   pick a result. */
const body = (input, sessionToken) => ({
  input,
  regionCode: 'US',
  includedRegionCodes: ['us'],
  includedPrimaryTypes: ['street_address', 'subpremise', 'premise'],
  ...(sessionToken ? { sessionToken } : {})
});

async function callGoogle(url, key, init) {
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, ...(init.headers || {}) }
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try { message = (JSON.parse(text).error || {}).message || text; } catch (ignored) { /* raw */ }
    const error = new Error('Places responded ' + response.status + ': ' + message);
    error.status = response.status;
    error.detail = String(message).slice(0, 300);
    throw error;
  }
  return JSON.parse(text || '{}');
}

export async function suggest(env, input, sessionToken) {
  const key = String(env.GOOGLE_PLACES_KEY || '').trim();
  if (!key) return { configured: false, suggestions: [] };

  const data = await callGoogle(AUTOCOMPLETE, key, {
    method: 'POST',
    body: JSON.stringify(body(input, sessionToken))
  });

  const suggestions = (data.suggestions || [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .slice(0, 5)
    .map((p) => ({
      id: p.placeId,
      // The main text is the street line; the rest is the city and state.
      line: (p.structuredFormat && p.structuredFormat.mainText &&
             p.structuredFormat.mainText.text) || (p.text && p.text.text) || '',
      context: (p.structuredFormat && p.structuredFormat.secondaryText &&
                p.structuredFormat.secondaryText.text) || ''
    }))
    .filter((s) => s.line);

  return { configured: true, suggestions };
}

/* Google returns the address in pieces; the form wants four fields. */
const COMPONENT = (components, type) => {
  const hit = components.find((c) => (c.types || []).indexOf(type) !== -1);
  return hit ? { long: hit.longText || '', short: hit.shortText || '' } : { long: '', short: '' };
};

export async function details(env, placeId, sessionToken) {
  const key = String(env.GOOGLE_PLACES_KEY || '').trim();
  if (!key) return { configured: false };

  const url = DETAILS + encodeURIComponent(placeId) +
    (sessionToken ? '?sessionToken=' + encodeURIComponent(sessionToken) : '');

  const data = await callGoogle(url, key, {
    method: 'GET',
    headers: { 'X-Goog-FieldMask': 'addressComponents,formattedAddress' }
  });

  const parts = data.addressComponents || [];
  const number = COMPONENT(parts, 'street_number').long;
  // The abbreviated form of the street: "Market St", not "Market Street".
  // That is how an address is written on an envelope, and what Google's own
  // formatted address uses.
  const route = COMPONENT(parts, 'route');
  const street = route.short || route.long;
  const unit = COMPONENT(parts, 'subpremise').long;

  return {
    configured: true,
    address: {
      street: [number, street].filter(Boolean).join(' ') + (unit ? ' ' + unit : ''),
      // Some addresses carry no city, only the township that stands in for one.
      city: COMPONENT(parts, 'locality').long ||
            COMPONENT(parts, 'sublocality').long ||
            COMPONENT(parts, 'administrative_area_level_3').long,
      state: COMPONENT(parts, 'administrative_area_level_1').short,
      zip: COMPONENT(parts, 'postal_code').long,
      formatted: data.formattedAddress || ''
    }
  };
}
