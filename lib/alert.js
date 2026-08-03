/**
 * Admin alert email — fired when CV generation fails after retries, i.e.
 * a customer has already paid (₹199) and got nothing back automatically.
 * Reuses the same Resend setup as api/email.js (RESEND_API_KEY, EMAIL_DOMAIN).
 * Best-effort: if the alert itself fails to send, we log it but never let
 * that mask or replace the original generation error for the caller.
 */
async function sendGenerationFailureAlert({ sessionId, razorpayOrderId, razorpayPaymentId, contact, template, mode, error }) {
  if (!process.env.RESEND_API_KEY) {
    console.error('sendGenerationFailureAlert: RESEND_API_KEY not set, cannot send alert', { sessionId });
    return;
  }
  try {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const to = process.env.ADMIN_ALERT_EMAIL || 'hello@realplannet.com';

    await resend.emails.send({
      from: `MakeMyCV Alerts <noreply@${process.env.EMAIL_DOMAIN || 'realplannet.com'}>`,
      to,
      subject: `⚠️ MakeMyCV generation failed — paid customer, needs manual follow-up`,
      html: `
        <div style="font-family:monospace;font-size:14px;line-height:1.6;">
          <p><strong>A customer paid but CV generation failed after retries.</strong></p>
          <p>Manually regenerate their CV or refund via Razorpay, then reach out.</p>
          <table cellpadding="6" style="border-collapse:collapse;">
            <tr><td><strong>Session</strong></td><td>${escapeHtml(sessionId || '—')}</td></tr>
            <tr><td><strong>Mode</strong></td><td>${escapeHtml(mode || '—')}</td></tr>
            <tr><td><strong>Template</strong></td><td>${escapeHtml(template || '—')}</td></tr>
            <tr><td><strong>Email</strong></td><td>${escapeHtml(contact?.email || '—')}</td></tr>
            <tr><td><strong>Phone</strong></td><td>${escapeHtml(contact?.phone || '—')}</td></tr>
            <tr><td><strong>Razorpay Order</strong></td><td>${escapeHtml(razorpayOrderId || '—')}</td></tr>
            <tr><td><strong>Razorpay Payment</strong></td><td>${escapeHtml(razorpayPaymentId || '—')}</td></tr>
            <tr><td><strong>Error</strong></td><td>${escapeHtml(error?.message || String(error) || '—')}</td></tr>
            <tr><td><strong>Reason</strong></td><td>${escapeHtml(error?.reason || '—')}</td></tr>
          </table>
        </div>`,
    });
  } catch (e) {
    console.error('sendGenerationFailureAlert failed to send:', e.message);
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { sendGenerationFailureAlert };
