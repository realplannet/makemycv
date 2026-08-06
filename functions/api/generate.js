import { v4 as uuidv4 } from 'uuid';
import { generateCVFromData, generateCVFromUpload, GenerationFailure } from '../../lib/ai.js';
import { renderDOCX } from '../../lib/docx.js';
import { saveSession, saveFailedGeneration } from '../../lib/db.js';
import { sendGenerationFailureAlert } from '../../lib/alert.js';
import { json, readJson } from '../../lib/http.js';

export async function onRequestPost({ request, env }) {
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
  } = await readJson(request);

  if (!sessionId) {
    return json({ error: 'sessionId is required' }, 400);
  }

  let result; // { cv, usage, stopReason, model }
  try {
    // 1. AI enhancement — read straight from the uploaded file in upload mode,
    //    no separate pre-payment extraction/parsing step. lib/ai.js retries
    //    transient upstream errors internally; anything that reaches this
    //    catch is either non-retryable or exhausted its retries.
    if (mode === 'upload') {
      if (!contact?.email || !contact?.phone) {
        return json({ error: 'contact email and phone are required' }, 400);
      }
      result = await generateCVFromUpload({ uploadedFile, notes, guidedAdds, contact }, env);
    } else {
      if (!cvData) return json({ error: 'cvData is required for scratch mode' }, 400);
      result = await generateCVFromData(cvData, env);
    }
  } catch (err) {
    // Payment already happened before this endpoint is ever called (see
    // verifyAndGenerate in app.js) — so a failure here means a customer
    // has paid ₹199 and gotten nothing automatically. Record it (nothing
    // else does) and alert so it can be resolved manually.
    console.error('Generate error:', err);
    await saveFailedGeneration(sessionId, {
      razorpayOrderId, razorpayPaymentId, contact, template, mode, error: err,
    }, env);
    await sendGenerationFailureAlert({
      sessionId, razorpayOrderId, razorpayPaymentId, contact, template, mode, error: err,
    }, env);

    const reason = err instanceof GenerationFailure ? err.reason : null;
    return json({
      error: 'Your payment was successful, but we hit a problem generating your CV. ' +
             'Our team has been notified and will email your CV within a few hours — ' +
             'if you don’t hear back, contact hello@realplannet.com with your payment ID.',
      reason,
    }, 502);
  }

  const { cv: enhancedCV, usage, stopReason, model } = result;

  try {
    // 2. Generate DOCX (PDF generation removed — Word is fully editable and this
    //    drops the Puppeteer/Chromium dependency entirely, one less failure point)
    const docxBuffer = await renderDOCX(enhancedCV);

    // 3. Save session record (docx bytes stored base64 directly in the
    //    row — see lib/db.js). usage/stopReason/model captured for cost
    //    attribution and to confirm whether prompt caching is engaging.
    const fileId  = uuidv4();
    const safeName = (enhancedCV.name || 'CV').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
    await saveSession(sessionId, fileId, safeName, docxBuffer, {
      email: contact?.email || enhancedCV.email || null,
      template,
      razorpayOrderId: razorpayOrderId || null,
      razorpayPaymentId: razorpayPaymentId || null,
      usage, stopReason, model,
    }, env);

    return json({
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
    }, env);
    await sendGenerationFailureAlert({
      sessionId, razorpayOrderId, razorpayPaymentId, contact, template, mode, error: err,
    }, env);
    return json({
      error: 'Your payment was successful, but we hit a problem finishing your CV file. ' +
             'Our team has been notified and will email your CV within a few hours — ' +
             'if you don’t hear back, contact hello@realplannet.com with your payment ID.',
    }, 502);
  }
}
