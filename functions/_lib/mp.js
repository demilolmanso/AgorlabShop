export async function getPayment(paymentId, token) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function searchPaymentByRef(externalReference, token) {
  const url = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}&sort=date_created&criteria=desc`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.results || [])[0] || null;
}

export async function verifySignature({ signatureHeader, requestId, secret, id }) {
  const parts = {};
  (signatureHeader || '').split(',').forEach(pair => {
    const [k, v] = pair.trim().split('=');
    if (k) parts[k] = v;
  });
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${id};request-id:${requestId};ts:${parts.ts};`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(manifest));
  const hash = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hash === parts.v1;
}
