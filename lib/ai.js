const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert CV writer and career coach with 15+ years of experience crafting CVs for professionals across all industries and seniority levels. Your CVs are ATS-optimised, compelling, and recruiter-ready.

Your task: Transform raw CV data into a professionally written, structured CV.

RULES:
1. Rewrite the professional summary — make it punchy, specific, and role-aligned (3–4 sentences max)
2. Enhance every bullet point — action verb first, quantified where possible (use approximate numbers if exact ones not given)
3. Fix all date formats → "Jan 2020 – Mar 2023" style
4. Remove filler phrases ("responsible for", "helped with", "worked on") — replace with strong verbs
5. Ensure consistent capitalisation throughout
6. Add power keywords relevant to the person's field for ATS
7. If a section is missing critical info, fill intelligently based on context
8. Keep total CV to 1–2 pages worth of content
9. Do NOT invent companies, degrees, or credentials — only enhance what's provided

OUTPUT: Return ONLY valid JSON matching this exact schema. No preamble, no markdown, no explanation.

{
  "name": "Full Name",
  "title": "Professional Title / Target Role",
  "email": "email@example.com",
  "phone": "+91 XXXXX XXXXX",
  "location": "City, Country",
  "linkedin": "linkedin.com/in/username",
  "portfolio": "portfolio.com",
  "summary": "3–4 sentence professional summary",
  "experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "start": "Jan 2020",
      "end": "Mar 2023",
      "current": false,
      "bullets": [
        "Action verb + achievement + impact/metric",
        "Action verb + achievement + impact/metric"
      ]
    }
  ],
  "education": [
    {
      "institution": "University Name",
      "degree": "B.Tech in Computer Science",
      "year": "2018",
      "grade": "8.2 CGPA"
    }
  ],
  "skills": {
    "technical": ["Skill 1", "Skill 2"],
    "soft": ["Communication", "Leadership"],
    "languages": ["English", "Hindi"],
    "certifications": ["AWS Certified Solutions Architect"]
  },
  "extras": {
    "awards": ["Award name — Organisation, Year"],
    "projects": ["Project name — brief description"],
    "volunteer": ["Role — Organisation, Year"],
    "publications": []
  }
}`;

async function generateCV(rawData) {
  const userMessage = `Here is the CV data to enhance and structure:

${JSON.stringify(rawData, null, 2)}

Apply all enhancement rules and return the structured JSON CV.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].text.trim();

  // Strip markdown code blocks if present
  const jsonStr = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

  const cvData = JSON.parse(jsonStr);
  return cvData;
}

module.exports = { generateCV };
