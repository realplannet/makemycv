const { verifySignature } = require('../../lib/payment');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId, paymentId, signature, sessionId } = req.body;
  if (!orderId || !paymentId || !signature) {
    return res.status(400).json({ error: 'Missing payment fields' });
  }

  const valid = verifySignature(orderId, paymentId, signature);
  if (!valid) return res.status(400).json({ error: 'Payment verification failed' });

  res.json({ success: true, sessionId });
};
