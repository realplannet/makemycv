/**
 * DEPRECATED — no longer called by the frontend.
 *
 * Pre-payment text extraction (pdf-parse/mammoth) was unreliable on
 * complex PDFs and images. As of the 2026-07-26 rework, the uploaded
 * file is sent straight to Claude (as a document/image block) inside
 * /api/generate, post-payment — see lib/ai.js generateCVFromUpload().
 *
 * Kept as a stub so any stale client calling this old endpoint fails
 * loudly instead of silently running the broken flow.
 */
import { json } from '../../lib/http.js';

export async function onRequest() {
  return json({ error: 'This endpoint is deprecated. Upload is now handled inside /api/generate after payment.' }, 410);
}
