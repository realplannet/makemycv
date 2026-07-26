/**
 * DEPRECATED — no longer called by the frontend.
 *
 * Pre-payment text extraction (pdf-parse/mammoth) was unreliable on
 * complex PDFs and images. As of the 2026-07-26 rework, the uploaded
 * file is sent straight to Claude (as a document/image block) inside
 * /api/generate, post-payment — see lib/ai.js generateCVFromUpload().
 *
 * Kept as a stub (rather than deleted — this session can't delete files
 * on the synced OneDrive folder) so any stale client calling this old
 * endpoint fails loudly instead of silently running the broken flow.
 */
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.status(410).json({ error: 'This endpoint is deprecated. Upload is now handled inside /api/generate after payment.' });
};
