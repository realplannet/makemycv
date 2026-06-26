const { v4: uuidv4 } = require('uuid');
const { generateCV }  = require('../lib/ai');
const { renderPDF }   = require('../lib/pdf');
const { renderDOCX }  = require('../lib/docx');
const { uploadFiles, saveSession } = require('../lib/supabase');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { sessionId, template = 'classic', cvData } = req.body;
    if (!sessionId || !cvData) {
      return res.status(400).json({ error: 'sessionId and cvData are required' });
    }

    // 1. AI enhancement
    const enhancedCV = await generateCV(cvData);

    // 2. Generate PDF + DOCX in parallel
    const [pdfBuffer, docxBuffer] = await Promise.all([
      renderPDF(enhancedCV, template),
      renderDOCX(enhancedCV),
    ]);

    // 3. Upload to Supabase Storage
    const fileId  = uuidv4();
    const safeName = (enhancedCV.name || 'CV').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
    const { pdfPath, docxPath } = await uploadFiles(fileId, safeName, pdfBuffer, docxBuffer);

    // 4. Save session record
    await saveSession(sessionId, fileId, safeName, pdfPath, docxPath);

    res.json({
      success:      true,
      fileId,
      name:         safeName,
      pdfFilename:  `${safeName}_CV.pdf`,
      docxFilename: `${safeName}_CV.docx`,
    });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: 'CV generation failed. Please try again.', debug_message: err.message, debug_stack: String(err.stack).split('\n').slice(0,8) });
  }
};
