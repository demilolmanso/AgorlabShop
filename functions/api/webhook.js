export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, message: 'Webhook activo' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true, message: 'POST recibido' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
