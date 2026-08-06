import Anthropic from '@anthropic-ai/sdk';
import mammoth from 'mammoth';

// Client is created per-call, not at module scope — see lib/payment.js
// comment for why (Pages Functions env arrives per-request via context.env).
function client(env) {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

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
 * NOTE on prompt caching: both system prompts below are wrapped as a single
 * cache_control-tagged block, but at current length (~110 / ~335 tokens)
 * they sit well under Sonnet's 1,024-token minimum cacheable prefix — so
 * caching will NOT actually engage yet (usage.cache_read_input_tokens will
 * read 0). This is wired correctly and ready to activate the moment the
 * prompt grows past that threshold (e.g. worked examples added later), but
 * padding it artificially just to hit a token count wasn't done here — that
 * needs real examples plus an eval pass, not a rushed addition to a paid
 * product's prompt. Left as a flagged follow-up, not silently "fixed".
 */
function cachedSystem(text) {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

/**
 * Retries a Claude call with exponential backoff + jitter on transient
 * upstream errors (rate limit / overloaded / 5xx). Never retries on 400s,
 * auth errors, or refusals — those won't succeed on a second try.
 */
async function callWithRetry(fn, tries = 3) {
  const RETRYABLE = [429, 500, 502, 503, 529];
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      const status = e?.status || e?.response?.status;
      const retryable = RETRYABLE.includes(status);
      if (!retryable || i === tries - 1) throw e;
      const delay = 2 ** i * 1000 + Math.random() * 500;
      console.warn(`Claude call failed (status ${status}), retry ${i + 1}/${tries - 1} in ${Math.round(delay)}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Raised when Claude responds successfully (no network/API error) but the
 * output can't be trusted or used — refusal, truncation, or unparseable
 * JSON. Distinct from network/API errors so the caller can log *why*
 * generation failed, not just that it did.
 */
export class GenerationFailure extends Error {
  constructor(message, { reason, usage, stopReason } = {}) {
    super(message);
    this.name = 'GenerationFailure';
    this.reason = reason;       // 'refusal' | 'max_tokens' | 'parse_error'
    this.usage = usage;
    this.stopReason = stopReason;
  }
}

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
 * Checks stop_reason before we ever try to parse the output. A truncated
 * or refused response is not valid JSON and should never be handed to
 * JSON.parse — that just trades a clear error for a confusing one.
 */
function assertUsableResponse(response) {
  if (response.stop_reason === 'refusal') {
    throw new GenerationFailure('Claude declined to generate this CV', {
      reason: 'refusal', usage: response.usage, stopReason: response.stop_reason,
    });
  }
  if (response.stop_reason === 'max_tokens') {
    throw new GenerationFailure('Claude response was truncated (max_tokens reached)', {
      reason: 'max_tokens', usage: response.usage, stopReason: response.stop_reason,
    });
  }
}

/**
 * Build-from-scratch flow: candidate filled the guided form manually.
 * rawData is the full structured cvData object.
 *
 * Returns { cv, usage, stopReason, model } — usage/stopReason/model are for
 * cost logging and diagnostics, not used by the templater.
 */
export async function generateCVFromData(rawData, env) {
  const userMessage = `Here is the CV data to enhance and structure:

${JSON.stringify(rawData, null, 2)}

Apply all enhancement rules and return the structured JSON CV.`;

  const response = await callWithRetry(() => client(env).messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: 'disabled' },
    system: cachedSystem(SYSTEM_PROMPT_SCRATCH),
    messages: [{ role: 'user', content: userMessage }],
  }));

  assertUsableResponse(response);

  let cv;
  try {
    cv = parseJSON(firstText(response));
  } catch (e) {
    throw new GenerationFailure('Could not parse Claude output as JSON', {
      reason: 'parse_error', usage: response.usage, stopReason: response.stop_reason,
    });
  }

  return { cv, usage: response.usage, stopReason: response.stop_reason, model: response.model };
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
 *
 * Returns { cv, usage, stopReason, model }.
 */
export async function generateCVFromUpload({ uploadedFile, notes, guidedAdds, contact }, env) {
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

  const response = await callWithRetry(() => client(env).messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: 'disabled' },
    system: cachedSystem(SYSTEM_PROMPT_UPLOAD),
    messages: [{ role: 'user', content }],
  }));

  assertUsableResponse(response);

  let cv;
  try {
    cv = parseJSON(firstText(response));
  } catch (e) {
    throw new GenerationFailure('Could not parse Claude output as JSON', {
      reason: 'parse_error', usage: response.usage, stopReason: response.stop_reason,
    });
  }

  return { cv, usage: response.usage, stopReason: response.stop_reason, model: response.model };
}
