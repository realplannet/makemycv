/**
 * GET /api/admin/stats
 * Returns dashboard KPIs
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

  try {
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      { count: total },
      { count: todayCount },
      { count: monthCount },
      { count: linkedinCount },
      { data: recentOrders },
      { data: templateStats },
    ] = await Promise.all([
      supabase.from('cv_sessions').select('*', { count: 'exact', head: true }).eq('paid', true),
      supabase.from('cv_sessions').select('*', { count: 'exact', head: true }).eq('paid', true).gte('created_at', today),
      supabase.from('cv_sessions').select('*', { count: 'exact', head: true }).eq('paid', true).gte('created_at', month),
      supabase.from('linkedin_orders').select('*', { count: 'exact', head: true }),
      supabase.from('cv_sessions').select('name,email,template,amount_paise,created_at').eq('paid', true).order('created_at', { ascending: false }).limit(5),
      supabase.from('cv_sessions').select('template').eq('paid', true),
    ]);

    // Template breakdown
    const tCount = {};
    (templateStats || []).forEach(r => {
      tCount[r.template || 'classic'] = (tCount[r.template || 'classic'] || 0) + 1;
    });

    // Revenue
    const revenueTotal = (total || 0) * 199;
    const revenueMonth = (monthCount || 0) * 199;

    res.json({
      cvs: {
        total:   total || 0,
        today:   todayCount || 0,
        month:   monthCount || 0,
      },
      revenue: {
        total_inr: revenueTotal,
        month_inr: revenueMonth,
      },
      linkedin: {
        total: linkedinCount || 0,
      },
      templates: tCount,
      recent:    recentOrders || [],
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};
