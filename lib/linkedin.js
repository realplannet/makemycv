/**
 * LinkedIn profile copy — checkout-time add-on (+₹99, see
 * functions/api/payment/create.js and functions/api/generate.js).
 *
 * Bundled into the same purchase as the CV now, not a separate post-purchase
 * charge (that flow — the old ₹49 "Add LinkedIn Copy" upsell button and its
 * standalone /api/linkedin payment+verify endpoint — is deprecated, see
 * functions/api/linkedin.js). Generates from the ALREADY-ENHANCED CV object
 * that's in memory during /api/generate, not a fresh D1 lookup by name/title
 * — the old endpoint's approach was thin (session.name + session.title only)
 * and produced generic copy; this has the full enhanced CV to draw from.
 *
 * Covers headline, about, AND (2026-08-08, per Raneesh) role-wise content —
 * a LinkedIn Experience-section entry per job (title + highlight bullets,
 * distinct in tone from the CV's own bullets — first-person, punchier,
 * written for a profile a recruiter skims, not a formal document) plus a
 * single combined Skills list for the profile's Skills & Endorsements
 * section (LinkedIn only has one Skills section, not one per role).
 */
import Anthropic from '@anthropic-ai/sdk';

const LINKEDIN_PROMPT = `You are a LinkedIn profile expert. Based on the CV data provided, write a complete LinkedIn profile content package:

1. HEADLINE (max 220 characters) — role + value proposition + key differentiator. No generic phrases like "Seeking opportunities". Be specific and keyword-rich.

2. ABOUT SECTION (3 paragraphs, max 2,600 characters total):
   - Paragraph 1: Who you are, years of experience, core expertise
   - Paragraph 2: Key achievements (quantified where possible), industries/companies
   - Paragraph 3: What you're focused on now + call to action (connect/reach out)

3. EXPERIENCE — for EVERY role in the CV's experience list, write a LinkedIn-style entry:
   - "title": the job title as it should appear on LinkedIn (keep the real title, lightly polish wording only if it helps searchability — never invent a different role)
   - "highlights": 3-5 short, punchy bullet points for that role's LinkedIn description. Different tone from a CV: first-person feel, achievement-led, scannable in 2 seconds each. Quantify where the CV gives you numbers; don't invent numbers that aren't there.

4. SKILLS — a single list of 15-20 keyword-style skills for the profile's Skills & Endorsements section, drawn from across the whole CV (technical skills, tools, domain expertise, certifications). Short noun phrases only ("Stakeholder Management", not "I manage stakeholders").

Return ONLY valid JSON matching this exact shape, one entry in "experience" per role in the CV, same order:
{
  "headline": "...",
  "about": "paragraph 1\\n\\nparagraph 2\\n\\nparagraph 3",
  "experience": [
    { "title": "...", "highlights": ["...", "..."] }
  ],
  "skills": ["...", "..."]
}`;

export async function generateLinkedInCopy(cv, env) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    thinking: { type: 'disabled' },
    system: LINKEDIN_PROMPT,
    messages: [{
      role: 'user',
      content: `CV data to base the LinkedIn profile copy on:\n\n${JSON.stringify(cv, null, 2)}`,
    }],
  });

  // Sonnet 5 runs adaptive thinking by default, so content[0] can be a
  // "thinking" block rather than "text" — find the text block explicitly.
  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('No text block in LinkedIn Claude response');
  const text = textBlock.text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  const parsed = JSON.parse(text);

  // Defensive defaults — never let a missing array crash the docx renderer.
  return {
    headline: parsed.headline || '',
    about: parsed.about || '',
    experience: Array.isArray(parsed.experience) ? parsed.experience : [],
    skills: Array.isArray(parsed.skills) ? parsed.skills : [],
  };
}
