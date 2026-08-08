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

// LinkedIn Headline + Summary add-on — bundled into the same checkout as
// the CV when the customer opts in (see functions/api/payment/create.js).
export function linkedinPricePaise(env) {
  return parseInt(env.LINKEDIN_PRICE_PAISE || '9900', 10); // ₹99 default
}

export async function createOrder(sessionId, env, { includeLinkedin = false } = {}) {
  const amount = pricePaise(env) + (includeLinkedin ? linkedinPricePaise(env) : 0);
  const order = await client(env).orders.create({
    amount,
    currency: 'INR',
    receipt: `cv_${sessionId}`,
    notes: { sessionId, includeLinkedin: includeLinkedin ? '1' : '0' },
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
