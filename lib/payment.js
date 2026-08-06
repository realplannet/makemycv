import Razorpay from 'razorpay';
import { createHmac } from 'node:crypto';

// Client is created per-call (not at module scope) — Pages Functions pass
// secrets via context.env per-request; module-level code runs once at
// cold-start before any request's env exists.
function client(env) {
  return new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
}

export function pricePaise(env) {
  return parseInt(env.CV_PRICE_PAISE || '19900', 10); // ₹199 default
}

export async function createOrder(sessionId, env) {
  const order = await client(env).orders.create({
    amount: pricePaise(env),
    currency: 'INR',
    receipt: `cv_${sessionId}`,
    notes: { sessionId },
  });
  return order;
}

export function verifySignature(orderId, paymentId, signature, env) {
  const body = `${orderId}|${paymentId}`;
  const expected = createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');
  return expected === signature;
}
