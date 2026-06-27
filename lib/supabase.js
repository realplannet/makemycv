const { createClient } = require('@supabase/supabase-js');

// Use service role key — only used server-side in API routes, never exposed to frontend
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = 'cv-files';
const EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Upload PDF and DOCX buffers to Supabase Storage.
 * Returns { pdfPath, docxPath }
 */
async function uploadFiles(fileId, name, pdfBuffer, docxBuffer) {
  const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');
  const pdfPath  = `${fileId}/${safeName}_CV.pdf`;
  const docxPath = `${fileId}/${safeName}_CV.docx`;

  const [pdfRes, docxRes] = await Promise.all([
    supabase.storage.from(BUCKET).upload(pdfPath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    }),
    supabase.storage.from(BUCKET).upload(docxPath, docxBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    }),
  ]);

  if (pdfRes.error)  throw new Error('PDF upload failed: ' + pdfRes.error.message);
  if (docxRes.error) throw new Error('DOCX upload failed: ' + docxRes.error.message);

  return { pdfPath, docxPath };
}

/**
 * Generate a signed download URL (valid 24 hours).
 */
async function getSignedUrl(path) {
  // download: true forces Content-Disposition: attachment on the Supabase Storage
  // response itself. Without this, the browser's anchor `download` attribute is
  // silently ignored on this cross-origin redirect (Storage is a different origin
  // from the Vercel app), so PDFs render inline in Chrome's PDF viewer instead of
  // downloading, leaving the user stuck on a bare PDF page with no way back.
  const filename = path.split('/').pop();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, EXPIRY_SECONDS, { download: filename });
  if (error) throw new Error('Signed URL error: ' + error.message);
  return data.signedUrl;
}

/**
 * Save session record to DB.
 * Table: cv_sessions (id uuid, session_id text, file_id text, pdf_path text, docx_path text, name text, paid boolean, created_at timestamptz)
 */
async function saveSession(sessionId, fileId, name, pdfPath, docxPath) {
  const { error } = await supabase.from('cv_sessions').upsert({
    session_id: sessionId,
    file_id:    fileId,
    name,
    pdf_path:   pdfPath,
    docx_path:  docxPath,
    paid:       true,
    created_at: new Date().toISOString(),
  });
  if (error) console.error('saveSession error:', error.message);
}

/**
 * Look up a session to get file paths.
 */
async function getSession(fileId) {
  const { data, error } = await supabase
    .from('cv_sessions')
    .select('*')
    .eq('file_id', fileId)
    .single();
  if (error) return null;
  return data;
}

module.exports = { uploadFiles, getSignedUrl, saveSession, getSession };
