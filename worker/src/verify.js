/* ==========================================================================
   Nixora Services LLC — proving an applicant owns the email they typed.

   A code is emailed and typed back. Nothing is stored anywhere: the code is
   signed, and the signature is what travels to the browser and back. The
   browser never holds the code — that only ever reaches the inbox — and
   cannot check a guess without the signing key, so guesses have to be made
   one network round trip at a time.

   The signing key is derived from the Resend key rather than configured
   separately, so this needs no new setting. It is a derivation, not the key
   itself: holding it reveals nothing about the account it came from. Set
   VERIFY_SECRET to use something else.
   ========================================================================== */

const CODE_MINUTES = 15;      // long enough to go and look, short enough to expire
const PROOF_HOURS = 3;        // long enough to finish a long application form

const encoder = new TextEncoder();

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function signingKey(env) {
  const base = String(env.VERIFY_SECRET || '').trim() ||
    'derived:' + String(env.RESEND_API_KEY || '').trim();

  return crypto.subtle.importKey(
    'raw', encoder.encode(base), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sign(env, parts) {
  const key = await signingKey(env);
  return b64url(await crypto.subtle.sign('HMAC', key, encoder.encode(parts.join('|'))));
}

/* Compares without leaking, through timing, how much of the value matched. */
function sameString(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let i = 0; i < left.length; i++) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

/* Six digits, drawn from the system's random source rather than Math.random.
   Short enough to read off a phone and type, and a guess still costs a round
   trip against an endpoint that answers one at a time. */
export function makeCode() {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String(bytes[0] % 1000000).padStart(6, '0');
}

export async function makeChallenge(env, email, code) {
  const expires = Date.now() + CODE_MINUTES * 60 * 1000;
  const signature = await sign(env, ['code', normalizeEmail(email), code, String(expires)]);
  return expires + '.' + signature;
}

export async function checkChallenge(env, email, code, challenge) {
  const parts = String(challenge || '').split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };

  const expires = Number(parts[0]);
  if (!expires || Date.now() > expires) return { ok: false, reason: 'expired' };

  const expected = await sign(env, ['code', normalizeEmail(email), String(code || ''), parts[0]]);
  if (!sameString(expected, parts[1])) return { ok: false, reason: 'wrong' };

  return { ok: true };
}

/* What the form carries once the code has been accepted. Tied to the address
   it was issued for, so it cannot be moved to a different one. */
export async function makeProof(env, email) {
  const expires = Date.now() + PROOF_HOURS * 60 * 60 * 1000;
  const signature = await sign(env, ['proof', normalizeEmail(email), String(expires)]);
  return expires + '.' + signature;
}

export async function checkProof(env, email, proof) {
  const parts = String(proof || '').split('.');
  if (parts.length !== 2) return { ok: false, reason: 'missing' };

  const expires = Number(parts[0]);
  if (!expires || Date.now() > expires) return { ok: false, reason: 'expired' };

  const expected = await sign(env, ['proof', normalizeEmail(email), parts[0]]);
  if (!sameString(expected, parts[1])) return { ok: false, reason: 'mismatch' };

  return { ok: true };
}
