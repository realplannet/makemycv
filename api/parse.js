/**
 * POST /api/parse
 * Body: { filename: string, type: 'pdf'|'docx', data: base64string }
 * Returns: structured CV JSON ready to pre-fill the form
 */

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PARSE_PROMPT = `You are a CV parser. Extract all information from the raw CV text provided and return it as structured JSON.

Return ONLY valid JSON — no markdown, no explanation, no preamble.

Schema:
{
  "personal": {
    "name": "",
    "title": "",
    "email": "",
    "phone": "",
    "location": "",
    "linkedin": "",
    "portfolio": ""
  },
  "summary": "",
  "experience": [
    {
      "company": "",
      "title": "",
      "start": "",
      "end": "",
      "current": false,
      "bullets": ["", ""]
    }
  ],
  "education": [
    {
      "institution": "",
      "degree": "",
      "year": "",
      "grade": ""
    }
  ],
  "skills": {
    "technical": [],
    "soft": [],
    "languages": [],
    "certifications": []
  },
  "extras": {
    "awards": [],
    "projects": [],
    "volunteer": [],
    "publications": []
  }
}

Rules:
- Extract every piece of information present. Do not invent anything.
- For dates, use format "MMM YYYY" (e.g. "Jan 2020")
- If current job, set current: true and end: ""
- Split skills into technical vs soft as best you can
- If a section is missing from the CV, return empty array/string for that field
- Responsibilities/duties → put as bullet array items`;

async function extractTextFromPDF(buffer) {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractTextFromDOCX(buffer) {
  const mammoth = require('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { filename, type, data } = req.body;

    if (!data) return res.status(400).json({ error: 'No file data received' });

    // Decode base64 → Buffer
    const buffer = Buffer.from(data, 'base64');

    // Extract raw text
    let rawText = '';
    const ext = (type || filename || '').toLowerCase();

    if (ext.includes('pdf')) {
      rawText = await extractTextFromPDF(buffer);
    } else if (ext.includes('doc')) {
      rawText = await extractTextFromDOCX(buffer);
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Please upload a PDF or Word document.' });
    }

    if (!rawText || rawText.trim().length < 50) {
      return res.status(400).json({ error: 'Could not extract text from this file. Try a different format.' });
    }

    // Claude parses the text into structured JSON
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', // faster + cheaper for parsing
      max_tokens: 2048,
      system: PARSE_PROMPT,
      messages: [{
        role: 'user',
        content: `Parse this CV:\n\n${rawText.slice(0, 8000)}`, // cap at 8k chars
      }],
    });

    const text = response.content[0].text.trim()
      .replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

    const cvData = JSON.parse(text);

    res.json({ success: true, cvData });

  } catch (err) {
    console.error('Parse error:', err);
    if (err instanceof SyntaxError) {
      return res.status(500).json({ error: 'Could not parse CV structure. Please fill the form manually.' });
    }
    res.status(500).json({ error: 'Upload failed. Please try again or fill the form manually.' });
  }
};
