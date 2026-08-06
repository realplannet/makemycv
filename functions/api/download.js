import { getSession } from '../../lib/db.js';
import { json, queryParams } from '../../lib/http.js';

// GET /api/download?fileId=xxx&type=docx
// Streams the .docx directly from D1 (base64 column) instead of redirecting
// to an object-storage signed URL — see lib/db.js for why there's no
// separate storage service. Same 24hr-expiry policy as before.
export async function onRequestGet({ request, env }) {
  const params = queryParams(request);
  const fileId = params.get('fileId');
  const type = params.get('type');

  if (!fileId || type !== 'docx') {
    return json({ error: 'fileId and type=docx required (PDF download was removed)' }, 400);
  }

  try {
    const session = await getSession(fileId, env);
    if (!session || !session.docx_data) return json({ error: 'Files not found or expired' }, 404);

    const age = Date.now() - new Date(session.created_at).getTime();
    if (age > 24 * 60 * 60 * 1000) {
      return json({ error: 'Download link expired. Links are valid for 24 hours.' }, 410);
    }

    const buffer = Buffer.from(session.docx_data, 'base64');
    const filename = `${session.name || 'CV'}_CV.docx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('Download error:', err);
    return json({ error: 'Could not retrieve file' }, 500);
  }
}
