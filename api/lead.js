/**
 * POST /api/lead
 * Body: { sessionId, stage, final, name, email, phone, notes, template }
 *
 * Called at every checkpoint in the upload-flow journey (details
 * submitted → template selected → payment initiated → payment
 * completed). Supabase's cv_leads row is upserted on every call, so it
 * always holds the furthest stage reached, even if the candidate abandons.
 *
 * Zoho only ever gets ONE submission per person (final:true) — either
 * on payment_completed, or via sendBeacon the moment the tab is hidden/
 * closed before that. Zoho's Free-plan dedup check treats repeat
 * Web-to-Lead submissions from the same email as duplicates needing
 * manual approval, so intermediate checkpoints (final:false) intentionally
 * only touch Supabase, never Zoho — see app.js pushLead() vs sendFinalLead().
 *
 * NOTE: the actual Zoho push happens client-side, straight from app.js
 * sendFinalLead() to Zoho's public Web-to-Lead endpoint (that's how
 * Zoho's own reference snippet works — no auth needed, it's designed for
 * cross-origin browser submission). This endpoint only ever touches
 * Supabase, as a parallel record of the same final state.
 *
 * Non-blocking on the frontend — failures here never stop checkout.
 */
const { saveLead } = require('../lib/db');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  // sendBeacon POSTs may arrive without a method override in some edge cases — still expect POST.
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { sessionId, stage, final, name, email, phone, notes, template } = req.body;
    if (!sessionId || !email || !phone) {
      return res.status(400).json({ error: 'sessionId, email and phone are required' });
    }

    await saveLead(sessionId, { name, email, phone, notes, stage, template });

    res.json({ success: true });
  } catch (err) {
    console.error('lead error:', err);
    // Never block the funnel on lead-capture failure.
    res.status(200).json({ success: false });
  }
};
