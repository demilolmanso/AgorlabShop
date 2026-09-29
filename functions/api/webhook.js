import { STATUS_MAP, fsGetOrder, fsUpdateOrder } from '../_lib/firebase.js';
import { getPayment, verifySignature } from '../_lib/mp.js';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function processPayment(paymentId, env) {
  const p = await getPayment(paymentId, env.MP_ACCESS_TOKEN);
  if (!p) return { ok: false, error: 'mp_fetch_failed' };

  const orderId = p.external_reference;
  if (!orderId) return { ok: false, error: 'sin_external_reference' };

  const order = await fsGetOrder(orderId, env);
  if (!order) return { ok: false, error: 'orden_no_encontrada', orderId };

  const newStatus = STATUS_MAP[p.status] || 'pending';

  // Idempotencia: una orden aprobada no retrocede (salvo reembolso/cancelación)
  if (order.status === 'approved' && !['refunded', 'cancelled'].includes(newStatus)) {
    return { ok: true, already: true, orderId, status: 'approved' };
  }

  const patch = {
    status: newStatus,
    mpPaymentId: String(p.id),
    mpStatus: String(p.status || ''),
    mpStatusDetail: String(p.status_detail || ''),
    mpPaymentMethod: String(p.payment_method_id || ''),
    updatedAt: { __ts: Date.now() },
  };

  // Control de monto
  const orderTotal = Math.round(Number(order.total || 0));
  const paid = Math.round(Number(p.transaction_amount || 0));
  if (newStatus === 'approved' && orderTotal > 0 && Math.abs(orderTotal - paid) > 1) {
    patch.status = 'review';
    patch.note = `Monto pagado ${paid} distinto al total ${orderTotal}`;
  }

  await fsUpdateOrder(orderId, patch, env);
  console.log(`✅ Orden ${orderId} → ${patch.status} (pago ${p.id})`);
  return { ok: true, orderId, status: patch.status };
}

export async function onRequestPost(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);

  let type = url.searchParams.get('type') || url.searchParams.get('topic') || '';
  let id = url.searchParams.get('data.id') || url.searchParams.get('id') || '';

  const raw = await request.text();
  if (raw) {
    try {
      const b = JSON.parse(raw);
      type = type || b.type || b.topic || '';
      id = id || b.data?.id || b.id || '';
    } catch {}
  }

  console.log('Webhook:', { type, id });

  type = String(type).toLowerCase();
  if (type && type !== 'payment') return json({ ok: true, ignored: type });
  if (!id) return json({ ok: true, ignored: 'sin_id' });

  // Firma opcional
  if (env.MP_WEBHOOK_SECRET) {
    const okSig = await verifySignature({
      signatureHeader: request.headers.get('x-signature'),
      requestId: request.headers.get('x-request-id'),
      secret: env.MP_WEBHOOK_SECRET,
      id: String(id),
    });
    if (!okSig) return json({ error: 'firma_inválida' }, 401);
  }

  // Procesar en background
  waitUntil(
    processPayment(String(id), env)
      .then(r => console.log('webhook ok:', r))
      .catch(e => console.error('webhook err:', e))
  );

  return json({ ok: true });
}

export async function onRequestGet(context) {
  return json({ ok: true, message: 'Webhook endpoint activo' });
}

export async function onRequest() {
  return json({ error: 'Método no permitido' }, 405);
}
