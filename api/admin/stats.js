/**
 * GET /api/admin/stats
 * Returns dashboard KPIs
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

  try {
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [totalR, todayR, monthR, linkedinR, recentR, templateR] = await Promise.all([
      d1('select count(*) as c from cv_sessions where paid = 1'),
      d1('select count(*) as c from cv_sessions where paid = 1 and created_at >= ?', [today]),
      d1('select count(*) as c from cv_sessions where paid = 1 and created_at >= ?', [month]),
      d1('select count(*) as c from linkedin_orders'),
      d1('select name,email,template,amount_paise,created_at from cv_sessions where paid = 1 order by created_at desc limit 5'),
      d1('select template from cv_sessions where paid = 1'),
    ]);

    const total        = totalR.results[0].c;
    const todayCount    = todayR.results[0].c;
    const monthCount    = monthR.results[0].c;
    const linkedinCount = linkedinR.results[0].c;
    const recentOrders  = recentR.results;

    const tCount = {};
    templateR.results.forEach(r => {
      tCount[r.template || 'classic'] = (tCount[r.template || 'classic'] || 0) + 1;
    });

    const revenueTotal = (total || 0) * 199;
    const revenueMonth = (monthCount || 0) * 199;

    res.json({
      cvs: { total: total || 0, today: todayCount || 0, month: monthCount || 0 },
      revenue: { total_inr: revenueTotal, month_inr: revenueMonth },
      linkedin: { total: linkedinCount || 0 },
      templates: tCount,
      recent: recentOrders || [],
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};
