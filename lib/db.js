/**
 * Cloudflare D1 storage layer — replaces lib/supabase.js.
 *
 * Why: the Supabase project backing this app went unreachable in production
 * ("fetch failed" on every call — a paused free-tier project) and its
 * replacement was never confidently located. Moved to Cloudflare D1, which
 * doesn't auto-pause. D1 has no external HTTP file storage product wired up
 * (R2 requires a separate account-level subscription we're deliberately
 * avoiding), so generated .docx files (50-150KB) are stored as base64 text
 * directly in the cv_sessions row instead of a separate object store —
 * simpler, one less service, and small enough that this is a non-issue.
 *
 * Auth: a Cloudflare Account API Token (Account > D1 > Edit) via the D1
 * HTTP query API. Needs CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID,
 * CLOUDFLARE_API_TOKEN env vars.
 */

const { v4: uuidv4 } = require('uuid');

const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${process.env.CLOUDFLARE_D1_DATABASE_ID}/query`;

/**
 * Runs one SQL statement against D1 via the HTTP API. Throws on any
 * failure (network or SQL) so callers can decide how to handle it —
 * mirrors the explicit-failure philosophy already used in lib/ai.js
 * rather than silently swallowing errors.
 */
async function d1(sql, params = []) {
  const res = await fetch(D1_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error('D1 query failed: ' + JSON.stringify(data.errors || data));
  }
  return data.result[0]; // { results: [...], success, meta }
}

/**
 * Save a completed generation. Upserts on file_id (matches old
 * Supabase saveSession behaviour). docxBuffer is stored base64-encoded
 * directly in the row — see module comment for why.
 */
async function saveSession(sessionId, fileId, name, docxBuffer, extras = {}) {
  try {
    await d1(
      `insert into cv_sessions (
         id, session_id, file_id, name, docx_data, paid, email, template, mode,
         razorpay_order_id, razorpay_payment_id, amount_paise, status,
         model_used, stop_reason, input_tokens, output_tokens,
         cache_creation_tokens, cache_read_tokens, generation_attempts, created_at
       ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       on conflict(file_id) do update set
         session_id=excluded.session_id, name=excluded.name, docx_data=excluded.docx_data,
         paid=excluded.paid, email=excluded.email, template=excluded.template,
         mode=excluded.mode, razorpay_order_id=excluded.razorpay_order_id,
         razorpay_payment_id=excluded.razorpay_payment_id, status=excluded.status,
         model_used=excluded.model_used, stop_reason=excluded.stop_reason,
         input_tokens=excluded.input_tokens, output_tokens=excluded.output_tokens,
         cache_creation_tokens=excluded.cache_creation_tokens,
         cache_read_tokens=excluded.cache_read_tokens,
         generation_attempts=excluded.generation_attempts`,
      [
        uuidv4(), sessionId, fileId, name, docxBuffer.toString('base64'), 1,
        extras.email || null, extras.template || 'classic', extras.mode || 'scratch',
        extras.razorpayOrderId || null, extras.razorpayPaymentId || null, 19900, 'completed',
        extras.model || null, extras.stopReason || null,
        extras.usage?.input_tokens ?? null, extras.usage?.output_tokens ?? null,
        extras.usage?.cache_creation_input_tokens ?? null, extras.usage?.cache_read_input_tokens ?? null,
        extras.attempts || 1, new Date().toISOString(),
      ]
    );
  } catch (err) {
    console.error('saveSession error:', err.message);
  }
}

/**
 * Records a paid-but-failed generation — see original comment in the
 * Supabase version. Same purpose, same shape, D1 instead of Postgres.
 */
async function saveFailedGeneration(sessionId, { razorpayOrderId, razorpayPaymentId, contact, template, mode, error } = {}) {
  try {
    await d1(
      `insert into cv_sessions (
         id, session_id, file_id, name, docx_data, paid, email, template, mode,
         razorpay_order_id, razorpay_payment_id, amount_paise, status,
         error_message, error_reason, created_at
       ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        uuidv4(), sessionId, `failed-${uuidv4()}`, null, null, 1,
        contact?.email || null, template || null, mode || null,
        razorpayOrderId || null, razorpayPaymentId || null, 19900, 'failed',
        (error?.message || String(error) || '').slice(0, 500), error?.reason || null,
        new Date().toISOString(),
      ]
    );
  } catch (err) {
    console.error('saveFailedGeneration error:', err.message);
  }
}

/** Look up a session (including docx_data) by file_id. */
async function getSession(fileId) {
  try {
    const { results } = await d1('select * from cv_sessions where file_id = ? limit 1', [fileId]);
    return results?.[0] || null;
  } catch (err) {
    console.error('getSession error:', err.message);
    return null;
  }
}

/** Upsert a lead at a journey checkpoint. session_id is unique. */
async function saveLead(sessionId, { name = '', email, phone, notes = '', stage = '', template = '' } = {}) {
  try {
    await d1(
      `insert into cv_leads (id, session_id, name, email, phone, notes, stage, template, created_at, updated_at)
       values (?,?,?,?,?,?,?,?,?,?)
       on conflict(session_id) do update set
         name=excluded.name, email=excluded.email, phone=excluded.phone, notes=excluded.notes,
         stage=excluded.stage, template=excluded.template, updated_at=excluded.updated_at`,
      [uuidv4(), sessionId, name, email, phone, notes, stage, template, new Date().toISOString(), new Date().toISOString()]
    );
  } catch (err) {
    console.error('saveLead error:', err.message);
  }
}

module.exports = { d1, saveSession, saveFailedGeneration, getSession, saveLead };
