const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  BorderStyle, WidthType, AlignmentType, TabStopType, TabStopPosition,
  ShadingType, HeadingLevel, convertInchesToTwip,
} = require('docx');

// Brand palette — matches the PDF templates' navy theme.
const NAVY  = '15334F';
const BLUE  = '2B6CB0';
const GREY  = '6B7280';
const TEXT  = '262626';
const STRIPE = 'EAF1F9';

const FONT = 'Calibri';
const PAGE_WIDTH_TWIPS = convertInchesToTwip(8.27) - convertInchesToTwip(0.7) * 2; // A4 minus margins

/**
 * Generates a visually styled .docx CV from structured CV data using the
 * `docx` library, matching the navy theme used by the PDF "classic" template
 * (navy headers with rule, blue accents, striped tables for Education/Skills).
 */
async function renderDOCX(cv) {
  const children = [];

  // ---- Header: name, title, contact line ----
  children.push(new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text: cv.name || '', bold: true, size: 44, color: NAVY, font: FONT })],
  }));

  if (cv.title) {
    children.push(new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: cv.title, bold: true, italics: false, size: 24, color: BLUE, font: FONT })],
    }));
  }

  const contactParts = [cv.email, cv.phone, cv.location, cv.linkedin, cv.portfolio].filter(Boolean);
  if (contactParts.length) {
    children.push(new Paragraph({
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: NAVY, space: 6 } },
      children: contactParts.map((part, i) => new TextRun({
        text: i < contactParts.length - 1 ? `${part}   |   ` : part,
        size: 18, color: '444444', font: FONT,
      })),
    }));
  }

  const sectionHeading = (text) => new Paragraph({
    spacing: { before: 200, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: 'C7D8E8', space: 4 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, color: NAVY, font: FONT, characterSpacing: 20 })],
  });

  // ---- Professional Summary ----
  if (cv.summary) {
    children.push(sectionHeading('Professional Summary'));
    children.push(new Paragraph({
      spacing: { after: 160 },
      alignment: AlignmentType.JUSTIFIED,
      children: [new TextRun({ text: cv.summary, size: 21, color: TEXT, font: FONT })],
    }));
  }

  // ---- Experience ----
  if (cv.experience?.length) {
    children.push(sectionHeading('Experience'));
    for (const e of cv.experience) {
      const dateLoc = `${e.start || ''} – ${e.current ? 'Present' : (e.end || '')}${e.location ? '   ·   ' + e.location : ''}`;
      children.push(new Paragraph({
        spacing: { after: 20 },
        tabStops: [{ type: TabStopType.RIGHT, position: PAGE_WIDTH_TWIPS }],
        children: [
          new TextRun({ text: e.title || '', bold: true, size: 21, color: NAVY, font: FONT }),
          new TextRun({ text: '  |  ', size: 21, color: '9AA5AF', font: FONT }),
          new TextRun({ text: e.company || '', bold: true, size: 21, color: BLUE, font: FONT }),
          new TextRun({ text: `\t${dateLoc}`, italics: true, size: 18, color: GREY, font: FONT }),
        ],
      }));
      for (const b of e.bullets || []) {
        children.push(new Paragraph({
          spacing: { after: 40 },
          bullet: { level: 0 },
          children: [new TextRun({ text: b, size: 20, color: TEXT, font: FONT })],
        }));
      }
      children.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
    }
  }

  // ---- Striped table helper (Education / Skills) ----
  const stripedTable = (rows) => new Table({
    width: { size: PAGE_WIDTH_TWIPS, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
    },
    rows: rows.map((r, i) => new TableRow({
      children: [
        new TableCell({
          width: { size: Math.round(PAGE_WIDTH_TWIPS * 0.28), type: WidthType.DXA },
          shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: STRIPE, fill: STRIPE } : undefined,
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: [new Paragraph({ children: [new TextRun({ text: r.label, bold: true, size: 20, color: NAVY, font: FONT })] })],
        }),
        new TableCell({
          width: { size: Math.round(PAGE_WIDTH_TWIPS * 0.72), type: WidthType.DXA },
          shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: STRIPE, fill: STRIPE } : undefined,
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: [new Paragraph({ children: [new TextRun({ text: r.value, size: 20, color: TEXT, font: FONT })] })],
        }),
      ],
    })),
  });

  // ---- Education ----
  if (cv.education?.length) {
    children.push(sectionHeading('Education'));
    const rows = cv.education.map(e => ({
      label: e.degree || '',
      value: `${e.institution || ''}${e.grade ? ' · ' + e.grade : ''} (${e.year || ''})`,
    }));
    children.push(stripedTable(rows));
    children.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
  }

  // ---- Skills ----
  const sk = cv.skills || {};
  const skillRows = [];
  if (sk.technical?.length)      skillRows.push({ label: 'Technical',      value: sk.technical.join(' · ') });
  if (sk.soft?.length)            skillRows.push({ label: 'Soft Skills',    value: sk.soft.join(' · ') });
  if (sk.languages?.length)       skillRows.push({ label: 'Languages',      value: sk.languages.join(' · ') });
  if (sk.certifications?.length)  skillRows.push({ label: 'Certifications', value: sk.certifications.join(' · ') });
  if (skillRows.length) {
    children.push(sectionHeading('Skills'));
    children.push(stripedTable(skillRows));
    children.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
  }

  // ---- Additional (awards / projects / volunteer) ----
  const ex = cv.extras || {};
  const hasExtras = [...(ex.awards || []), ...(ex.projects || []), ...(ex.volunteer || [])].length > 0;
  if (hasExtras) {
    children.push(sectionHeading('Additional'));
    const extraGroup = (label, items) => {
      if (!items?.length) return;
      children.push(new Paragraph({
        spacing: { before: 60, after: 20 },
        children: [new TextRun({ text: label, bold: true, size: 20, color: NAVY, font: FONT })],
      }));
      for (const item of items) {
        children.push(new Paragraph({
          spacing: { after: 30 },
          bullet: { level: 0 },
          children: [new TextRun({ text: item, size: 20, color: TEXT, font: FONT })],
        }));
      }
    };
    extraGroup('Awards', ex.awards);
    extraGroup('Projects', ex.projects);
    extraGroup('Volunteer', ex.volunteer);
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: convertInchesToTwip(0.7), bottom: convertInchesToTwip(0.7), left: convertInchesToTwip(0.7), right: convertInchesToTwip(0.7) },
        },
      },
      children,
    }],
    styles: {
      default: { document: { run: { font: FONT, size: 20, color: TEXT } } },
    },
  });

  return Packer.toBuffer(doc);
}

module.exports = { renderDOCX };
