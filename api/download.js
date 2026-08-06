const { getSession } = require('../lib/db');

// GET /api/download?fileId=xxx&type=docx
// Streams the .docx directly from D1 (base64 column) instead of redirecting
// to an object-storage signed URL — see lib/db.js for why there's no
// separate storage service. Same 24hr-expiry policy as before.
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { fileId, type } = req.query;

  if (!fileId || type !== 'docx') {
    return res.status(400).json({ error: 'fileId and type=docx required (PDF download was removed)' });
  }

  try {
    const session = await getSession(fileId);
    if (!session || !session.docx_data) return res.status(404).json({ error: 'Files not found or expired' });

    const age = Date.now() - new Date(session.created_at).getTime();
    if (age > 24 * 60 * 60 * 1000) {
      return res.status(410).json({ error: 'Download link expired. Links are valid for 24 hours.' });
    }

    const buffer = Buffer.from(session.docx_data, 'base64');
    const filename = `${session.name || 'CV'}_CV.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Could not retrieve file' });
  }
};
