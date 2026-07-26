const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Sonnet 4 (claude-sonnet-4-20250514) is deprecated and 404s — use the current alias.
const MODEL = 'claude-sonnet-4-6'; // matches what's already live in prod (verified working via direct API test)

const OUTPUT_SCHEMA = `{
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

const ENHANCEMENT_RULES = `RULES:
1. Rewrite the professional summary — make it punchy, specific, and role-aligned (3–4 sentences max)
2. Enhance every bullet point — action verb first, quantified where possible (use approximate numbers if exact ones not given)
3. Fix all date formats → "Jan 2020 – Mar 2023" style
4. Remove filler phrases ("responsible for", "helped with", "worked on") — replace with strong verbs
5. Ensure consistent capitalisation throughout
6. Add power keywords relevant to the person's field for ATS
7. If a section is missing critical info, fill intelligently based on context
8. Keep total CV to 1–2 pages worth of content
9. Do NOT invent companies, degrees, or credentials — only enhance what's provided`;

const SYSTEM_PROMPT_SCRATCH = `You are an expert CV writer and career coach with 15+ years of experience crafting CVs for professionals across all industries and seniority levels. Your CVs are ATS-optimised, compelling, and recruiter-ready.

Your task: Transform raw CV data into a professionally written, structured CV.

${ENHANCEMENT_RULES}

OUTPUT: Return ONLY valid JSON matching this exact schema. No preamble, no markdown, no explanation.

${OUTPUT_SCHEMA}`;

const SYSTEM_PROMPT_UPLOAD = `You are an expert CV writer and career coach with 15+ years of experience crafting CVs for professionals across all industries and seniority levels. Your CVs are ATS-optimised, compelling, and recruiter-ready.

You will be given the candidate's ORIGINAL CV as a document or image (read it directly — do not ask for a text version), plus:
- optional free-text notes describing new information, edits, or corrections
- optional structured "quick add" entries (new experience / education / certifications / projects the candidate explicitly added)
- the candidate's current contact email and phone — always use these in the output, even if the uploaded CV shows different or older contact details

Read the uploaded CV yourself. Merge in the notes and quick-add entries — treat them as authoritative updates that override or extend what's in the original file if there's any conflict. Then produce a professionally rewritten, structured CV.

${ENHANCEMENT_RULES}
10. If the notes or quick-add entries mention something not in the original CV (e.g. a new role, a promotion, a new certification), add it as its own entry — do not merge it into an existing entry unless the candidate clearly means an update to that same entry.

OUTPUT: Return ONLY valid JSON matching this exact schema. No preamble, no markdown, no explanation.

${OUTPUT_SCHEMA}`;

/**
 * Pulls the first text block out of a Claude response.
 * Sonnet 5 runs adaptive thinking by default, so content[0] can be a
 * "thinking" block rather than "text" — never assume index 0.
 */
function firstText(response) {
  const block = response.content.find(b => b.type === 'text');
  if (!block) throw new Error('No text block in Claude response');
  return block.text.trim();
}

function parseJSON(rawText) {
  const jsonStr = rawText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(jsonStr);
}

/**
 * Build-from-scratch flow: candidate filled the guided form manually.
 * rawData is the full structured cvData object.
 */
async function generateCVFromData(rawData) {
  const userMessage = `Here is the CV data to enhance and structure:

${JSON.stringify(rawData, null, 2)}

Apply all enhancement rules and return the structured JSON CV.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: 'disabled' },
    system: SYSTEM_PROMPT_SCRATCH,
    messages: [{ role: 'user', content: userMessage }],
  });

  return parseJSON(firstText(response));
}

/**
 * Upload flow: candidate uploaded an existing CV file. We send the raw
 * file straight to Claude (PDF as a document block, images via vision)
 * instead of pre-extracting text with pdf-parse/mammoth — those were
 * unreliable on complex layouts and scanned images. DOCX is the one
 * format Claude can't read directly, so that still goes through mammoth
 * text extraction first.
 *
 * @param {Object} params
 * @param {Object|null} params.uploadedFile - { filename, type, data(base64) } or null
 * @param {string} params.notes - free-text additions/changes from the candidate
 * @param {Object} params.guidedAdds - { experience:[], education:[], certifications:[], projects:[] }
 * @param {Object} params.contact - { email, phone }
 */
async function generateCVFromUpload({ uploadedFile, notes, guidedAdds, contact }) {
  const content = [];

  if (uploadedFile && uploadedFile.data) {
    const ext = (uploadedFile.type || uploadedFile.filename || '').toLowerCase();

    if (ext.includes('pdf')) {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: uploadedFile.data },
      });
    } else if (ext.includes('doc')) {
      // Claude can't read DOCX directly — mammoth extraction is reliable for this format.
      const mammoth = require('mammoth');
      const buffer = Buffer.from(uploadedFile.data, 'base64');
      const result = await mammoth.extractRawText({ buffer });
      content.push({
        type: 'text',
        text: `Original CV (extracted from Word document):\n\n${result.value.slice(0, 12000)}`,
      });
    } else if (ext.includes('jpg') || ext.includes('jpeg') || ext.includes('png')) {
      const mediaType = ext.includes('png') ? 'image/png' : 'image/jpeg';
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: uploadedFile.data },
      });
    } else {
      throw new Error('Unsupported file type');
    }
  }

  const notesBlock = [
    `Candidate's current contact details — always use these in the output: email=${contact?.email || ''}, phone=${contact?.phone || ''}`,
    notes ? `Free-text notes from the candidate about new info / changes:\n${notes}` : 'No free-text notes provided.',
    guidedAdds && Object.values(guidedAdds).some(a => a && a.length)
      ? `Structured quick-add entries the candidate explicitly added:\n${JSON.stringify(guidedAdds, null, 2)}`
      : 'No structured quick-add entries.',
  ].join('\n\n');

  content.push({ type: 'text', text: notesBlock });

  if (!uploadedFile) {
    content.unshift({
      type: 'text',
      text: 'No CV file was uploaded — build the CV entirely from the notes and quick-add entries below.',
    });
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: 'disabled' },
    system: SYSTEM_PROMPT_UPLOAD,
    messages: [{ role: 'user', content }],
  });

  return parseJSON(firstText(response));
}

/**
 * Back-compat wrapper — routes to the right generation path based on
 * what the caller sent. Old callers passing a flat cvData object still work.
 */
async function generateCV(payload) {
  if (payload && payload.__mode === 'upload') {
    return generateCVFromUpload(payload);
  }
  return generateCVFromData(payload);
}

module.exports = { generateCV, generateCVFromData, generateCVFromUpload };
