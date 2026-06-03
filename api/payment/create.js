const { createOrder, PRICE_PAISE } = require('../../lib/payment');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const order = await createOrder(sessionId);
    res.json({
      orderId:  order.id,
      amount:   PRICE_PAISE,
      currency: 'INR',
      keyId:    process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('payment/create error:', err);
    res.status(500).json({ error: 'Could not create payment order' });
  }
};
