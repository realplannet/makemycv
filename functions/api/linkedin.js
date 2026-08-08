/**
 * DEPRECATED — no longer called by the frontend.
 *
 * This used to be a standalone ₹49 post-purchase upsell: its own Razorpay
 * order/verify, then a lookup of the CV session by name/title alone. As of
 * 2026-08-07 the LinkedIn add-on (+₹99) is offered at checkout time,
 * bundled into the same order as the CV, and generated from the full
 * enhanced CV object already in memory during /api/generate — see
 * lib/linkedin.js and functions/api/generate.js. Kept as a stub (rather
 * than deleted) so any stale client calling this old endpoint fails
 * loudly instead of silently running the broken flow.
 */
import { json } from '../../lib/http.js';

export async function onRequest() {
  return json({ error: 'This endpoint is deprecated. LinkedIn copy is now included as a checkout-time add-on inside /api/generate.' }, 410);
}
