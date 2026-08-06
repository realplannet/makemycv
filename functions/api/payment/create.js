import { createOrder, pricePaise } from '../../../lib/payment.js';
import { json, readJson } from '../../../lib/http.js';

export async function onRequestPost({ request, env }) {
  try {
    const { sessionId } = await readJson(request);
    if (!sessionId) return json({ error: 'sessionId required' }, 400);

    const order = await createOrder(sessionId, env);
    return json({
      orderId:  order.id,
      amount:   pricePaise(env),
      currency: 'INR',
      keyId:    env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('payment/create error:', err);
    return json({ error: 'Could not create payment order' }, 500);
  }
}
