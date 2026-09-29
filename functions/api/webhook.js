// functions/api/webhook.js
// Versión simplificada para debugging

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Log para debugging
  console.log('Webhook recibido:', {
    method: request.method,
    url: url.toString(),
    params: Object.fromEntries(url.searchParams),
  });

  // Parsear body
  const raw = await request.text();
  let body = {};
  try {
    body = JSON.parse(raw);
  } catch {}

  const type = url.searchParams.get('type') || url.searchParams.get('topic') || body.type || body.topic || '';
  const id = url.searchParams.get('data.id') || url.searchParams.get('id') || body.data?.id || body.id || '';

  console.log('Webhook data:', { type, id });

  // Solo procesar pagos
  if (type && type !== 'payment') {
    return json({ ok: true, ignored: type });
  }

  if (!id) {
    return json({ ok: true, ignored: 'sin_id' });
  }

  // TODO: Implementar lógica de actualización de orden
  // Por ahora solo logueamos
  console.log('Pago recibido:', id);

  return json({ ok: true, message: 'Webhook recibido (pendiente de implementación)' });
}

export async function onRequestGet(context) {
  return json({ ok: true, message: 'Webhook endpoint activo' });
}

export async function onRequest() {
  return json({ error: 'Método no permitido' }, 405);
}
