export async function onRequestPost({ request, env }) {
  try {
    // 1. Recibimos los datos del carrito que envía tu HTML
    const body = await request.json();

    // 2. Tomamos el token SECRETO desde las variables de Cloudflare
    const token = env.MP_ACCESS_TOKEN;

    if (!token) {
      return new Response(JSON.stringify({ error: "Falta el token de MP en Cloudflare" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3. Hacemos la petición a Mercado Pago desde el servidor (seguro)
    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await mpResponse.json();

    // 4. Le devolvemos el resultado a tu web
    return new Response(JSON.stringify(data), {
      status: mpResponse.status,
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
