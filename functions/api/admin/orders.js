/**
 * GET /api/admin/orders?page=1&limit=20&search=&status=
 * Protected by ADMIN_SECRET header
 */
import { d1 } from '../../../lib/db.js';
import { json, queryParams } from '../../../lib/http.js';

function auth(request, env) {
  const secret = request.headers.get('x-admin-secret');
  return secret && secret === env.ADMIN_SECRET;
}

export async function onRequestGet({ request, env }) {
  if (!auth(request, env)) return json({ error: 'Unauthorised' }, 401);

  const params = queryParams(request);
  const page   = Math.max(1, parseInt(params.get('page')  || '1', 10));
  const limit  = Math.min(100, parseInt(params.get('limit') || '20', 10));
  const search = (params.get('search') || '').trim();
  const status = params.get('status') || '';
  const offset = (page - 1) * limit;

  try {
    const where  = [];
    const qparams = [];
    if (search) {
      where.push('(name like ? or email like ?)');
      qparams.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
      where.push('status = ?');
      qparams.push(status);
    }
    const whereSql = where.length ? `where ${where.join(' and ')}` : '';

    // docx_data excluded from the select list — it's base64 file content,
    // not needed for an orders table and would bloat the response.
    const [countR, ordersR] = await Promise.all([
      d1(`select count(*) as c from cv_sessions ${whereSql}`, qparams, env),
      d1(
        `select id, session_id, file_id, name, email, template, mode,
                razorpay_order_id, razorpay_payment_id, amount_paise, status,
                paid, error_message, error_reason, created_at
         from cv_sessions ${whereSql}
         order by created_at desc limit ? offset ?`,
        [...qparams, limit, offset],
        env
      ),
    ]);

    const count = countR.results[0].c;

    return json({
      orders: ordersR.results,
      total:  count,
      page,
      limit,
      pages:  Math.ceil(count / limit),
    });
  } catch (err) {
    console.error('Admin orders error:', err);
    return json({ error: 'Failed to fetch orders' }, 500);
  }
}
