const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const PRICE_PAISE = parseInt(process.env.CV_PRICE_PAISE || '19900', 10); // ₹199 default

async function createOrder(sessionId) {
  const order = await razorpay.orders.create({
    amount: PRICE_PAISE,
    currency: 'INR',
    receipt: `cv_${sessionId}`,
    notes: { sessionId },
  });
  return order;
}

function verifySignature(orderId, paymentId, signature) {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');
  return expected === signature;
}

module.exports = { createOrder, verifySignature, PRICE_PAISE };
