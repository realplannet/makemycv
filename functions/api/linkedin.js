/**
 * POST /api/linkedin
 * Body: { sessionId, fileId, orderId, paymentId, signature }
 * Verifies ₹49 Razorpay payment, generates LinkedIn headline + summary via Claude
 */
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { verifySignature } from '../../lib/payment.js';
import { getSession, d1 } from '../../lib/db.js';
import { json, readJson } from '../../lib/http.js';

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

export async function onRequestPost({ request, env }) {
  try {
    const { sessionId, fileId, orderId, paymentId, signature } = await readJson(request);

    // Verify payment
    if (!verifySignature(orderId, paymentId, signature, env)) {
      return json({ error: 'Payment verification failed' }, 400);
    }

    // Get CV data from session
    const session = await getSession(fileId, env);
    if (!session) return json({ error: 'Session not found' }, 404);

    // Generate LinkedIn copy
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      system: LINKEDIN_PROMPT,
      messages: [{
        role: 'user',
        content: `Generate LinkedIn copy for: ${session.name?.replace(/_/g, ' ')}\nRole: ${session.title || 'Professional'}\n\nCV summary available — generate compelling LinkedIn profile copy.`,
      }],
    });

    // Sonnet 5 runs adaptive thinking by default, so content[0] can be a
    // "thinking" block rather than "text" — find the text block explicitly.
    const textBlock = response.content.find(b => b.type === 'text');
    const text = textBlock.text.trim()
      .replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const linkedin = JSON.parse(text);

    // Save to DB
    await d1(
      'insert into linkedin_orders (id, session_id, file_id, payment_id, headline, about, created_at) values (?,?,?,?,?,?,?)',
      [uuidv4(), sessionId, fileId, paymentId, linkedin.headline, linkedin.about, new Date().toISOString()],
      env
    );

    return json({ success: true, linkedin });
  } catch (err) {
    console.error('LinkedIn error:', err);
    return json({ error: 'LinkedIn generation failed. Please try again.' }, 500);
  }
}
