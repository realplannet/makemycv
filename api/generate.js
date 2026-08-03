const { v4: uuidv4 } = require('uuid');
const { generateCVFromData, generateCVFromUpload, GenerationFailure } = require('../lib/ai');
const { renderDOCX }  = require('../lib/docx');
const { uploadFiles, saveSession, saveFailedGeneration } = require('../lib/supabase');
const { sendGenerationFailureAlert } = require('../lib/alert');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

  let result; // { cv, usage, stopReason, model }
  try {
    // 1. AI enhancement — read straight from the uploaded file in upload mode,
    //    no separate pre-payment extraction/parsing step. lib/ai.js retries
    //    transient upstream errors internally; anything that reaches this
    //    catch is either non-retryable or exhausted its retries.
    if (mode === 'upload') {
      if (!contact?.email || !contact?.phone) {
        return res.status(400).json({ error: 'contact email and phone are required' });
      }
      result = await generateCVFromUpload({ uploadedFile, notes, guidedAdds, contact });
    } else {
      if (!cvData) return res.status(400).json({ error: 'cvData is required for scratch mode' });
      result = await generateCVFromData(cvData);
    }
  } catch (err) {
    // Payment already happened before this endpoint is ever called (see
    // verifyAndGenerate in app.js) — so a failure here means a customer
    // has paid ₹199 and gotten nothing automatically. Record it (nothing
    // else does) and alert so it can be resolved manually, rather than
    // just logging to Vercel's ephemeral function logs.
    console.error('Generate error:', err);
    await saveFailedGeneration(sessionId, {
      razorpayOrderId, razorpayPaymentId, contact, template, mode, error: err,
    });
    await sendGenerationFailureAlert({
      sessionId, razorpayOrderId, razorpayPaymentId, contact, template, mode, error: err,
    });

    const reason = err instanceof GenerationFailure ? err.reason : null;
    return res.status(502).json({
      error: 'Your payment was successful, but we hit a problem generating your CV. ' +
             'Our team has been notified and will email your CV within a few hours — ' +
             'if you don’t hear back, contact hello@realplannet.com with your payment ID.',
      reason,
    });
  }

  const { cv: enhancedCV, usage, stopReason, model } = result;

  try {
    // 2. Generate DOCX (PDF generation removed — Word is fully editable and this
    //    drops the Puppeteer/Chromium dependency entirely, one less failure point)
    const docxBuffer = await renderDOCX(enhancedCV);

    // 3. Upload to Supabase Storage
    const fileId  = uuidv4();
    const safeName = (enhancedCV.name || 'CV').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
    const { docxPath } = await uploadFiles(fileId, safeName, docxBuffer);

    // 4. Save session record — usage/stopReason/model captured for cost
    //    attribution and to confirm whether prompt caching is engaging
    //    (see supabase-schema-v4.sql).
    await saveSession(sessionId, fileId, safeName, docxPath, {
      email: contact?.email || enhancedCV.email || null,
      template,
      razorpayOrderId: razorpayOrderId || null,
      razorpayPaymentId: razorpayPaymentId || null,
      usage, stopReason, model,
    });

    res.json({
      success:      true,
      fileId,
      name:         safeName,
      docxFilename: `${safeName}_CV.docx`,
    });
  } catch (err) {
    // Claude succeeded here — failure is in DOCX render / storage, after
    // we already have a usable CV. Same paid-but-unfulfilled situation.
    console.error('Generate error (post-AI):', err);
    await saveFailedGeneration(sessionId, {
      razorpayOrderId, razorpayPaymentId, contact, template, mode, error: err,
    });
    await sendGenerationFailureAlert({
      sessionId, razorpayOrderId, razorpayPaymentId, contact, template, mode, error: err,
    });
    res.status(502).json({
      error: 'Your payment was successful, but we hit a problem finishing your CV file. ' +
             'Our team has been notified and will email your CV within a few hours — ' +
             'if you don’t hear back, contact hello@realplannet.com with your payment ID.',
    });
  }
};
