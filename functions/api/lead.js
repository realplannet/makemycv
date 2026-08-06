/**
 * POST /api/lead
 * Body: { sessionId, stage, final, name, email, phone, notes, template }
 *
 * Called at every checkpoint in the upload-flow journey (details
 * submitted → template selected → payment initiated → payment
 * completed). cv_leads row is upserted on every call, so it always
 * holds the furthest stage reached, even if the candidate abandons.
 *
 * Zoho only ever gets ONE submission per person (final:true) — either
 * on payment_completed, or via sendBeacon the moment the tab is hidden/
 * closed before that — pushed client-side straight from app.js, not here.
 * This endpoint only ever touches D1, as a parallel record of the same
 * final state. Non-blocking on the frontend — failures here never stop
 * checkout, so this always returns 200 even on internal failure.
 */
import { saveLead } from '../../lib/db.js';
import { json, readJson } from '../../lib/http.js';

export async function onRequestPost({ request, env }) {
  try {
    const { sessionId, name, email, phone, notes, stage, template } = await readJson(request);
    if (!sessionId || !email || !phone) {
      return json({ error: 'sessionId, email and phone are required' }, 400);
    }

    await saveLead(sessionId, { name, email, phone, notes, stage, template }, env);

    return json({ success: true });
  } catch (err) {
    console.error('lead error:', err);
    return json({ success: false }, 200);
  }
}
