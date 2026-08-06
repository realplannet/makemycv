/**
 * GET /api/admin/stats
 * Returns dashboard KPIs
 */
import { d1 } from '../../../lib/db.js';
import { json } from '../../../lib/http.js';

function auth(request, env) {
  const secret = request.headers.get('x-admin-secret');
  return secret && secret === env.ADMIN_SECRET;
}

export async function onRequestGet({ request, env }) {
  if (!auth(request, env)) return json({ error: 'Unauthorised' }, 401);

  try {
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [totalR, todayR, monthR, linkedinR, recentR, templateR] = await Promise.all([
      d1('select count(*) as c from cv_sessions where paid = 1', [], env),
      d1('select count(*) as c from cv_sessions where paid = 1 and created_at >= ?', [today], env),
      d1('select count(*) as c from cv_sessions where paid = 1 and created_at >= ?', [month], env),
      d1('select count(*) as c from linkedin_orders', [], env),
      d1('select name,email,template,amount_paise,created_at from cv_sessions where paid = 1 order by created_at desc limit 5', [], env),
      d1('select template from cv_sessions where paid = 1', [], env),
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

    return json({
      cvs: { total: total || 0, today: todayCount || 0, month: monthCount || 0 },
      revenue: { total_inr: revenueTotal, month_inr: revenueMonth },
      linkedin: { total: linkedinCount || 0 },
      templates: tCount,
      recent: recentOrders || [],
    });
  } catch (err) {
    console.error('Stats error:', err);
    return json({ error: 'Failed to fetch stats' }, 500);
  }
}
