// JWT RS256 + OAuth + Firestore REST (service account)
const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let TOKEN_CACHE = { token: null, exp: 0 };

export const STATUS_MAP = {
  approved: 'approved',
  authorized: 'approved',
  pending: 'pending',
  in_process: 'pending',
  in_mediation: 'review',
  rejected: 'rejected',
  cancelled: 'cancelled',
  refunded: 'refunded',
  charged_back: 'refunded',
};

async function signJwt(env) {
  const enc = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: env.FIREBASE_SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const data = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(claims)))}`;
  const pem = String(env.FIREBASE_SA_PRIVATE_KEY).replace(/\\n/g, '\n');
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8', der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(data));
  return `${data}.${b64url(sig)}`;
}

export async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (TOKEN_CACHE.token && TOKEN_CACHE.exp > now + 60) return TOKEN_CACHE.token;
  const assertion = await signJwt(env);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
  });
  if (!res.ok) throw new Error('OAuth token error: ' + (await res.text()));
  const data = await res.json();
  TOKEN_CACHE = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return TOKEN_CACHE.token;
}

function fsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}

export function parseFsDoc(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc.fields || {})) {
    out[k] =
      'stringValue' in v ? v.stringValue :
      'integerValue' in v ? Number(v.integerValue) :
      'doubleValue' in v ? v.doubleValue :
      'booleanValue' in v ? v.booleanValue :
      'timestampValue' in v ? v.timestampValue :
      'nullValue' in v ? null : null;
  }
  return out;
}

async function fsBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
}

export async function fsGetOrder(orderId, env) {
  const token = await getAccessToken(env);
  const url = `${await fsBase(env)}/orders/${orderId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Firestore GET ' + res.status);
  return parseFsDoc(await res.json());
}

export async function fsUpdateOrder(orderId, patch, env) {
  const token = await getAccessToken(env);
  const fields = {};
  for (const [k, v] of Object.entries(patch)) {
    fields[k] = (v && typeof v === 'object' && v.__ts)
      ? { timestampValue: new Date(v.__ts).toISOString() }
      : fsValue(v);
  }
  const masks = Object.keys(patch).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const url = `${await fsBase(env)}/orders/${orderId}?${masks}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error('Firestore PATCH ' + res.status + ' ' + (await res.text()));
  return true;
}
