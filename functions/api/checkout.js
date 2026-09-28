export async function onRequestPost(context) {
  try {
    // 1. Recibe los datos enviados desde tu frontend
    const body = await context.request.json();

    // 2. Hace la petición a Mercado Pago usando el token seguro guardado en Cloudflare
    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await mpResponse.json();

    // 3. Devuelve la respuesta al frontend
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
      status: mpResponse.status
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
