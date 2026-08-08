/**
 * LinkedIn headline + about copy — checkout-time add-on (+₹99, see
 * functions/api/payment/create.js and functions/api/generate.js).
 *
 * Bundled into the same purchase as the CV now, not a separate post-purchase
 * charge (that flow — the old ₹49 "Add LinkedIn Copy" upsell button and its
 * standalone /api/linkedin payment+verify endpoint — is deprecated, see
 * functions/api/linkedin.js). Generates from the ALREADY-ENHANCED CV object
 * that's in memory during /api/generate, not a fresh D1 lookup by name/title
 * — the old endpoint's approach was thin (session.name + session.title only)
 * and produced generic copy; this has the full enhanced CV to draw from.
 */
import Anthropic from '@anthropic-ai/sdk';

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

export async function generateLinkedInCopy(cv, env) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    thinking: { type: 'disabled' },
    system: LINKEDIN_PROMPT,
    messages: [{
      role: 'user',
      content: `CV data to base the LinkedIn copy on:\n\n${JSON.stringify(cv, null, 2)}`,
    }],
  });

  // Sonnet 5 runs adaptive thinking by default, so content[0] can be a
  // "thinking" block rather than "text" — find the text block explicitly.
  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('No text block in LinkedIn Claude response');
  const text = textBlock.text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(text);
}
