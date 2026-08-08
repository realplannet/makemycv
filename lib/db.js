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
 * CLOUDFLARE_API_TOKEN — passed in per-request as `env` (Pages Functions
 * bindings arrive via context.env, not process.env, and module-level code
 * runs once at cold-start before any request's env exists).
 */

import { v4 as uuidv4 } from 'uuid';

function d1Url(env) {
  return `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${env.CLOUDFLARE_D1_DATABASE_ID}/query`;
}

/**
 * Runs one SQL statement against D1 via the HTTP API. Throws on any
 * failure (network or SQL) so callers can decide how to handle it.
 */
export async function d1(sql, params = [], env) {
  const res = await fetch(d1Url(env), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
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

/** Cross-runtime buffer → base64 (Buffer exists under nodejs_compat, but keep a manual fallback). */
function bufferToBase64(buf) {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(buf)) return buf.toString('base64');
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Save a completed generation. Upserts on file_id (matches old
 * Supabase saveSession behaviour). docxBuffer is stored base64-encoded
 * directly in the row — see module comment for why.
 */
export async function saveSession(sessionId, fileId, name, docxBuffer, extras = {}, env) {
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
        uuidv4(), sessionId, fileId, name, bufferToBase64(docxBuffer), 1,
        extras.email || null, extras.template || 'classic', extras.mode || 'scratch',
        extras.razorpayOrderId || null, extras.razorpayPaymentId || null, 19900, 'completed',
        extras.model || null, extras.stopReason || null,
        extras.usage?.input_tokens ?? null, extras.usage?.output_tokens ?? null,
        extras.usage?.cache_creation_input_tokens ?? null, extras.usage?.cache_read_input_tokens ?? null,
        extras.attempts || 1, new Date().toISOString(),
      ],
      env
    );
  } catch (err) {
    console.error('saveSession error:', err.message);
  }
}

/**
 * Records a paid-but-failed generation — see original comment in the
 * Supabase version. Same purpose, same shape, D1 instead of Postgres.
 */
export async function saveFailedGeneration(sessionId, { razorpayOrderId, razorpayPaymentId, contact, template, mode, error } = {}, env) {
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
      ],
      env
    );
  } catch (err) {
    console.error('saveFailedGeneration error:', err.message);
  }
}

/** Look up a session (including docx_data) by file_id. */
export async function getSession(fileId, env) {
  try {
    const { results } = await d1('select * from cv_sessions where file_id = ? limit 1', [fileId], env);
    return results?.[0] || null;
  } catch (err) {
    console.error('getSession error:', err.message);
    return null;
  }
}

/** Upsert a lead at a journey checkpoint. session_id is unique. */
export async function saveLead(sessionId, { name = '', email, phone, notes = '', stage = '', template = '' } = {}, env) {
  try {
    await d1(
      `insert into cv_leads (id, session_id, name, email, phone, notes, stage, template, created_at, updated_at)
       values (?,?,?,?,?,?,?,?,?,?)
       on conflict(session_id) do update set
         name=excluded.name, email=excluded.email, phone=excluded.phone, notes=excluded.notes,
         stage=excluded.stage, template=excluded.template, updated_at=excluded.updated_at`,
      [uuidv4(), sessionId, name, email, phone, notes, stage, template, new Date().toISOString(), new Date().toISOString()],
      env
    );
  } catch (err) {
    console.error('saveLead error:', err.message);
  }
}

/**
 * LinkedIn add-on deliverable — bundled into the same purchase as the CV
 * (see functions/api/generate.js). Stored in the pre-existing
 * `linkedin_orders` table (originally built for a separate ₹49 purchase
 * flow, now reused for the bundled +₹99 checkout option) so the admin
 * dashboard's `admin_orders.has_linkedin` view keeps working unchanged.
 */
export async function saveLinkedInOrder(sessionId, fileId, paymentId, headline, about, docxBuffer, env) {
  await d1(
    `insert into linkedin_orders (id, session_id, file_id, payment_id, headline, about, docx_data, created_at)
     values (?,?,?,?,?,?,?,?)`,
    [uuidv4(), sessionId, fileId, paymentId || null, headline || null, about || null, bufferToBase64(docxBuffer), new Date().toISOString()],
    env
  );
}

/** Look up the LinkedIn add-on deliverable (including docx_data) by CV file_id. */
export async function getLinkedInOrder(fileId, env) {
  try {
    const { results } = await d1('select * from linkedin_orders where file_id = ? order by created_at desc limit 1', [fileId], env);
    return results?.[0] || null;
  } catch (err) {
    console.error('getLinkedInOrder error:', err.message);
    return null;
  }
}
