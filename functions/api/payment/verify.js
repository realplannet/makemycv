import { verifySignature } from '../../../lib/payment.js';
import { json, readJson } from '../../../lib/http.js';

export async function onRequestPost({ request, env }) {
  const { orderId, paymentId, signature, sessionId } = await readJson(request);
  if (!orderId || !paymentId || !signature) {
    return json({ error: 'Missing payment fields' }, 400);
  }

  const valid = verifySignature(orderId, paymentId, signature, env);
  if (!valid) return json({ error: 'Payment verification failed' }, 400);

  return json({ success: true, sessionId });
}
