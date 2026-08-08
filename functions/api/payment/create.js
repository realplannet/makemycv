import { createOrder, pricePaise, linkedinPricePaise } from '../../../lib/payment.js';
import { json, readJson } from '../../../lib/http.js';

export async function onRequestPost({ request, env }) {
  try {
    const { sessionId, includeLinkedin } = await readJson(request);
    if (!sessionId) return json({ error: 'sessionId required' }, 400);

    const order = await createOrder(sessionId, env, { includeLinkedin: !!includeLinkedin });
    return json({
      orderId:  order.id,
      amount:   pricePaise(env) + (includeLinkedin ? linkedinPricePaise(env) : 0),
      cvAmount: pricePaise(env),
      linkedinAmount: includeLinkedin ? linkedinPricePaise(env) : 0,
      currency: 'INR',
      keyId:    env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('payment/create error:', err);
    return json({ error: 'Could not create payment order' }, 500);
  }
}
