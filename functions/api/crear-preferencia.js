// functions/crear-preferencia.js
// Cloudflare Pages Function → ruta: /api/crear-preferencia
// El secreto MP_ACCESS_TOKEN se configura en el dashboard de Cloudflare,
// NUNCA en este archivo ni en el frontend.

const MP_URL = 'https://api.mercadopago.com/checkout/preferences';

export async function onRequestPost(context) {
  const token = context.env.MP_ACCESS_TOKEN;

  // 1) Secreto configurado?
  if (!token) {
    return json({ error: 'Falta configurar MP_ACCESS_TOKEN en el entorno de Cloudflare.' }, 500);
  }

  // 2) Leer y validar livianamente el cuerpo
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return json({ error: 'El carrito está vacío.' }, 400);

  for (const it of items) {
    if (!it.title || !(Number(it.unit_price) > 0) || !(Number(it.quantity) > 0)) {
      return json({ error: 'Ítems inválidos en la preferencia.' }, 400);
    }
  }

  // 3) Reenviar a Mercado Pago con el secreto (solo server-side)
  try {
    const mpRes = await fetch(MP_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: items.map(it => ({
          id: String(it.id || ''),
          title: String(it.title).slice(0, 255),
          description: String(it.description || '').slice(0, 255),
          picture_url: it.picture_url,
          category_id: it.category_id || 'general',
          quantity: Math.floor(Number(it.quantity)),
          currency_id: 'ARS',
          unit_price: Number(it.unit_price)
        })),
        payer: body.payer,
        external_reference: body.external_reference,
        back_urls: body.back_urls,
        auto_return: 'approved',
        metadata: body.metadata || {}
      })
    });

    const data = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok) {
      console.error('Mercado Pago respondió:', mpRes.status, data);
      return json({ error: data.message || 'Error al crear la preferencia en Mercado Pago.' }, mpRes.status);
    }
    return json({ init_point: data.init_point, sandbox_init_point: data.sandbox_init_point, id: data.id });
  } catch (e) {
    console.error('Error contactando Mercado Pago:', e);
    return json({ error: 'No se pudo contactar a Mercado Pago.' }, 502);
  }
}

// Rechazar cualquier otro método
export async function onRequest() {
  return json({ error: 'Método no permitido.' }, 405);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
