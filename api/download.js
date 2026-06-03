const { getSession, getSignedUrl } = require('../lib/supabase');

// GET /api/download?fileId=xxx&type=pdf|docx
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { fileId, type } = req.query;

  if (!fileId || !['pdf', 'docx'].includes(type)) {
    return res.status(400).json({ error: 'fileId and type (pdf|docx) required' });
  }

  try {
    const session = await getSession(fileId);
    if (!session) return res.status(404).json({ error: 'Files not found or expired' });

    // Check 24-hour expiry
    const age = Date.now() - new Date(session.created_at).getTime();
    if (age > 24 * 60 * 60 * 1000) {
      return res.status(410).json({ error: 'Download link expired. Links are valid for 24 hours.' });
    }

    const filePath   = type === 'pdf' ? session.pdf_path : session.docx_path;
    const signedUrl  = await getSignedUrl(filePath);

    // Redirect to Supabase signed URL — browser downloads directly from storage
    res.redirect(302, signedUrl);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Could not generate download link' });
  }
};
