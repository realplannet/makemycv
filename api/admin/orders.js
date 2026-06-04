/**
 * GET /api/admin/orders?page=1&limit=20&search=&status=
 * Protected by ADMIN_SECRET header
 */

const { createClient } = require('@supabase/supabase-js');

function auth(req) {
  const secret = req.headers['x-admin-secret'];
  return secret && secret === process.env.ADMIN_SECRET;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!auth(req)) return res.status(401).json({ error: 'Unauthorised' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const page   = Math.max(1, parseInt(req.query.page  || '1', 10));
  const limit  = Math.min(100, parseInt(req.query.limit || '20', 10));
  const search = (req.query.search || '').trim();
  const status = req.query.status || '';
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('cv_sessions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({
      orders: data,
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
