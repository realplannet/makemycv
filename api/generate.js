const { v4: uuidv4 } = require('uuid');
const { generateCVFromData, generateCVFromUpload } = require('../lib/ai');
const { renderPDF }   = require('../lib/pdf');
const { renderDOCX }  = require('../lib/docx');
const { uploadFiles, saveSession } = require('../lib/supabase');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      sessionId,
      template = 'executive',
      mode = 'scratch',       // 'scratch' (guided form) | 'upload' (uploaded CV file)
      cvData,                 // scratch mode
      uploadedFile,           // upload mode: { filename, type, data(base64) } | null
      notes,                  // upload mode: free text
      guidedAdds,             // upload mode: { experience:[], education:[], certifications:[], projects:[] }
      contact,                // upload mode: { email, phone }
      razorpayOrderId,
      razorpayPaymentId,
    } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    // 1. AI enhancement — read straight from the uploaded file in upload mode,
    //    no separate pre-payment extraction/parsing step.
    let enhancedCV;
    if (mode === 'upload') {
      if (!contact?.email || !contact?.phone) {
        return res.status(400).json({ error: 'contact email and phone are required' });
      }
      enhancedCV = await generateCVFromUpload({ uploadedFile, notes, guidedAdds, contact });
    } else {
      if (!cvData) return res.status(400).json({ error: 'cvData is required for scratch mode' });
      enhancedCV = await generateCVFromData(cvData);
    }

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
    await saveSession(sessionId, fileId, safeName, pdfPath, docxPath, {
      email: contact?.email || enhancedCV.email || null,
      template,
      razorpayOrderId: razorpayOrderId || null,
      razorpayPaymentId: razorpayPaymentId || null,
    });

    res.json({
      success:      true,
      fileId,
      name:         safeName,
      pdfFilename:  `${safeName}_CV.pdf`,
      docxFilename: `${safeName}_CV.docx`,
    });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: 'CV generation failed. Please try again.' });
  }
};
