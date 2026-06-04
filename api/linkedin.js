/**
 * POST /api/linkedin
 * Body: { sessionId, fileId, orderId, paymentId, signature }
 * Verifies ₹49 Razorpay payment, generates LinkedIn headline + summary via Claude
 */

const Anthropic = require('@anthropic-ai/sdk');
const { verifySignature } = require('../lib/payment');
const { getSession } = require('../lib/supabase');
const { createClient } = require('@supabase/supabase-js');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const LINKEDIN_PROMPT = `You are a LinkedIn profile expert. Based on the CV data provided, write:

1. A LinkedIn HEADLINE (max 220 characters) — role + value proposition + key differentiator. No generic phrases like "Seeking opportunities". Be specific and keyword-rich.

2. A LinkedIn ABOUT SECTION (3 paragraphs, max 2,600 characters total):
   - Paragraph 1: Who you are, years of experience, core expertise
   - Paragraph 2: Key achievements (quantified where possible), industries/companies
   - Paragraph 3: What you're focused on now + call to action (connect/reach out)

Return ONLY valid JSON:
{
  "headline": "...",
  "about": "paragraph 1\\n\\nparagraph 2\\n\\nparagraph 3"
}`;

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { sessionId, fileId, orderId, paymentId, signature } = req.body;

    // Verify payment
    if (!verifySignature(orderId, paymentId, signature)) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    // Get CV data from session
    const session = await getSession(fileId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Generate LinkedIn copy
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: LINKEDIN_PROMPT,
      messages: [{
        role: 'user',
        content: `Generate LinkedIn copy for: ${session.name?.replace(/_/g, ' ')}\nRole: ${session.title || 'Professional'}\n\nCV summary available — generate compelling LinkedIn profile copy.`,
      }],
    });

    const text = response.content[0].text.trim()
      .replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const linkedin = JSON.parse(text);

    // Save to DB
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    await supabase.from('linkedin_orders').insert({
      session_id:  sessionId,
      file_id:     fileId,
      payment_id:  paymentId,
      headline:    linkedin.headline,
      about:       linkedin.about,
      created_at:  new Date().toISOString(),
    });

    res.json({ success: true, linkedin });
  } catch (err) {
    console.error('LinkedIn error:', err);
    res.status(500).json({ error: 'LinkedIn generation failed. Please try again.' });
  }
};
