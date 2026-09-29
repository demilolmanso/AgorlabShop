import { fsGetOrder, fsUpdateOrder } from './_lib/firebase.js';
import { getPayment, searchPaymentByRef } from './_lib/mp.js';
import { STATUS_MAP } from './_lib/firebase.js';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const orderId = body.orderId;
  const paymentId = body.paymentId;
  if (!orderId && !paymentId) return json({ error: 'orderId o paymentId requerido' }, 400);

  let payment = null;
  if (paymentId) {
    payment = await getPayment(paymentId, env.MP_ACCESS_TOKEN);
  } else if (orderId) {
    payment = await searchPaymentByRef(orderId, env.MP_ACCESS_TOKEN);
  }

  if (!payment) {
    const order = orderId ? await fsGetOrder(orderId, env).catch(() => null) : null;
    return json({ ok: true, status: order?.status || 'pending', message: 'Sin pagos registrados todavía' });
  }

  const resolvedOrderId = payment.external_reference || orderId;
  const order = await fsGetOrder(resolvedOrderId, env);
  if (!order) return json({ ok: false, error: 'orden_no_encontrada' });

  const newStatus = STATUS_MAP[payment.status] || 'pending';
  if (order.status === 'approved' && !['refunded', 'cancelled'].includes(newStatus)) {
    return json({ ok: true, status: 'approved', already: true });
  }

  const patch = {
    status: newStatus,
    mpPaymentId: String(payment.id),
    mpStatus: String(payment.status || ''),
    mpStatusDetail: String(payment.status_detail || ''),
    mpPaymentMethod: String(payment.payment_method_id || ''),
    updatedAt: { __ts: Date.now() },
  };
  await fsUpdateOrder(resolvedOrderId, patch, env);
  return json({ ok: true, status: patch.status, orderId: resolvedOrderId });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequest() {
  return json({ error: 'Método no permitido' }, 405);
}
