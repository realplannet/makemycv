/**
 * GET /api/admin/orders?page=1&limit=20&search=&status=
 * Protected by ADMIN_SECRET header
 */

const { d1 } = require('../../lib/db');

function auth(req) {
  const secret = req.headers['x-admin-secret'];
  return secret && secret === process.env.ADMIN_SECRET;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!auth(req)) return res.status(401).json({ error: 'Unauthorised' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const page   = Math.max(1, parseInt(req.query.page  || '1', 10));
  const limit  = Math.min(100, parseInt(req.query.limit || '20', 10));
  const search = (req.query.search || '').trim();
  const status = req.query.status || '';
  const offset = (page - 1) * limit;

  try {
    const where  = [];
    const params = [];
    if (search) {
      where.push('(name like ? or email like ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    const whereSql = where.length ? `where ${where.join(' and ')}` : '';

    // docx_data excluded from the select list — it's base64 file content,
    // not needed for an orders table and would bloat the response.
    const [countR, ordersR] = await Promise.all([
      d1(`select count(*) as c from cv_sessions ${whereSql}`, params),
      d1(
        `select id, session_id, file_id, name, email, template, mode,
                razorpay_order_id, razorpay_payment_id, amount_paise, status,
                paid, error_message, error_reason, created_at
         from cv_sessions ${whereSql}
         order by created_at desc limit ? offset ?`,
        [...params, limit, offset]
      ),
    ]);

    const count = countR.results[0].c;

    res.json({
      orders: ordersR.results,
      total:  count,
      page,
      limit,
      pages:  Math.ceil(count / limit),
    });
  } catch (err) {
    console.error('Admin orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};
