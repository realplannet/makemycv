const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  LevelFormat, TabStopType, HeadingLevel, convertInchesToTwip,
} = require('docx');

// ---- Design system: resume-builder skill, Navy/Teal scheme (Phase 3) ----
const NAVY   = '1A3A5C';
const TEAL   = '0E7490';
const SILVER = 'E8EDF2';
const DARK   = '1C2B3A';
const MID    = '4A5568';
const WHITE  = 'FFFFFF';
const FONT   = 'Arial';

const PAGE_MARGIN = 700;                // twips, left/right page margin — keeps body text off the page edge
const BODY_WIDTH_TWIPS = 11906 - PAGE_MARGIN * 2; // A4 width minus margins = usable width for every full-width element

const noBorder  = { style: BorderStyle.NONE, size: 0, color: WHITE };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function hr(color, thickness = 6) {
  return new Paragraph({
    spacing: { before: 0, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: thickness, color } },
  });
}

function gap(pts = 80) {
  return new Paragraph({ spacing: { before: pts, after: 0 }, children: [new TextRun('')] });
}

function sectionTitle(label) {
  return [
    new Paragraph({
      spacing: { before: 220, after: 60 },
      children: [new TextRun({
        text: label.toUpperCase(), bold: true, size: 22, font: FONT, color: NAVY, allCaps: true,
      })],
    }),
    hr(TEAL, 6),
  ];
}

function bulletPara(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 18, font: FONT, color: DARK })],
  });
}

function jobHeader(title, company, dates, location) {
  const dateLocText = location ? `${dates}  •  ${location}` : dates;
  return new Paragraph({
    spacing: { before: 140, after: 30 },
    tabStops: [{ type: TabStopType.RIGHT, position: BODY_WIDTH_TWIPS }],
    children: [
      new TextRun({ text: title || '', bold: true, size: 20, font: FONT, color: NAVY }),
      new TextRun({ text: '  |  ', size: 18, font: FONT, color: MID }),
      new TextRun({ text: company || '', bold: true, size: 18, font: FONT, color: TEAL }),
      new TextRun({ text: '\t' }),
      new TextRun({ text: dateLocText, size: 17, font: FONT, color: MID, italics: true }),
    ],
  });
}

// Clear-pattern shading (Phase 6 checklist: never SOLID — causes black backgrounds in real Word).
function shade(color) {
  return { type: ShadingType.CLEAR, color: 'auto', fill: color };
}

function cellMargins() {
  return { top: 80, bottom: 80, left: 100, right: 100 };
}

/**
 * Header banner — full-width navy block: name (white, bold, large), title
 * subtitle, contact row. Built as a single-row, single-column, borderless
 * table so the navy fill spans the full page width edge-to-edge.
 */
function headerBanner(cv) {
  const contactParts = [cv.email, cv.phone, cv.location, cv.linkedin, cv.portfolio].filter(Boolean);

  const cellChildren = [
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: cv.name || '', bold: true, size: 56, font: FONT, color: WHITE })],
    }),
  ];

  if (cv.title) {
    cellChildren.push(new Paragraph({
      spacing: { after: contactParts.length ? 100 : 0 },
      children: [new TextRun({ text: cv.title, bold: true, size: 24, font: FONT, color: 'BFE3EC' })],
    }));
  }

  if (contactParts.length) {
    cellChildren.push(new Paragraph({
      children: contactParts.map((part, i) => new TextRun({
        text: i < contactParts.length - 1 ? `${part}   |   ` : part,
        size: 17, font: FONT, color: 'E2E8F0',
      })),
    }));
  }

  return new Table({
    width: { size: BODY_WIDTH_TWIPS, type: WidthType.DXA },
    borders: noBorders,
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: BODY_WIDTH_TWIPS, type: WidthType.DXA },
        shading: shade(NAVY),
        margins: { top: 360, bottom: 320, left: 0, right: 0 },
        children: cellChildren,
      })],
    })],
  });
}

/**
 * Keyword strip — thin teal bar directly under the header banner with the
 * candidate's top technical/certified keywords (closest available proxy to
 * the skill's "12-15 ATS keywords" without running a separate AI pass).
 */
function keywordStrip(cv) {
  const sk = cv.skills || {};
  const pool = [...(sk.technical || []), ...(sk.certifications || [])];
  const keywords = [...new Set(pool)].slice(0, 10);
  if (!keywords.length) return null;

  return new Table({
    width: { size: BODY_WIDTH_TWIPS, type: WidthType.DXA },
    borders: noBorders,
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: BODY_WIDTH_TWIPS, type: WidthType.DXA },
        shading: shade(TEAL),
        margins: { top: 100, bottom: 100, left: 0, right: 0 },
        children: [new Paragraph({
          children: keywords.map((k, i) => new TextRun({
            text: i < keywords.length - 1 ? `${k}  |  ` : k,
            size: 16, font: FONT, color: WHITE, bold: true,
          })),
        })],
      })],
    })],
  });
}

/**
 * Core competencies — 3-column grid of checkmark-prefixed items in silver
 * pill cells (Phase 3, layout rule 3). Sourced from soft skills, falling
 * back to technical skills if soft skills weren't supplied.
 */
function competencyGrid(cv) {
  const sk = cv.skills || {};
  const items = (sk.soft?.length ? sk.soft : sk.technical) || [];
  if (!items.length) return null;

  const cols = 3;
  const rows = [];
  for (let i = 0; i < items.length; i += cols) {
    const rowItems = items.slice(i, i + cols);
    while (rowItems.length < cols) rowItems.push('');
    rows.push(new TableRow({
      children: rowItems.map(text => new TableCell({
        width: { size: Math.round(BODY_WIDTH_TWIPS / cols), type: WidthType.DXA },
        shading: text ? shade(SILVER) : undefined,
        margins: cellMargins(),
        children: [new Paragraph({
          children: text ? [
            new TextRun({ text: '✓ ', bold: true, size: 18, font: FONT, color: TEAL }),
            new TextRun({ text, size: 18, font: FONT, color: DARK }),
          ] : [],
        })],
      })),
    }));
  }

  return new Table({
    width: { size: BODY_WIDTH_TWIPS, type: WidthType.DXA },
    borders: {
      top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: WHITE },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: WHITE },
    },
    rows,
  });
}

/** Two-column badge-pill table — used for certifications and languages. */
function badgeTable(items) {
  const cols = 2;
  const rows = [];
  for (let i = 0; i < items.length; i += cols) {
    const rowItems = items.slice(i, i + cols);
    while (rowItems.length < cols) rowItems.push('');
    rows.push(new TableRow({
      children: rowItems.map(text => new TableCell({
        width: { size: Math.round(BODY_WIDTH_TWIPS / cols), type: WidthType.DXA },
        shading: text ? shade(SILVER) : undefined,
        margins: cellMargins(),
        children: [new Paragraph({
          children: text ? [new TextRun({ text, size: 18, font: FONT, color: DARK, bold: true })] : [],
        })],
      })),
    }));
  }
  return new Table({
    width: { size: BODY_WIDTH_TWIPS, type: WidthType.DXA },
    borders: {
      top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: WHITE },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: WHITE },
    },
    rows,
  });
}

/** Two-column alternating-row table for the technical skills breakdown. */
function technicalSkillsTable(rowDefs) {
  return new Table({
    width: { size: BODY_WIDTH_TWIPS, type: WidthType.DXA },
    borders: noBorders,
    rows: rowDefs.map((r, i) => new TableRow({
      children: [
        new TableCell({
          width: { size: Math.round(BODY_WIDTH_TWIPS * 0.22), type: WidthType.DXA },
          shading: shade(i % 2 === 0 ? SILVER : WHITE),
          margins: cellMargins(),
          children: [new Paragraph({ children: [new TextRun({ text: r.label, bold: true, size: 18, font: FONT, color: NAVY })] })],
        }),
        new TableCell({
          width: { size: Math.round(BODY_WIDTH_TWIPS * 0.78), type: WidthType.DXA },
          shading: shade(i % 2 === 0 ? SILVER : WHITE),
          margins: cellMargins(),
          children: [new Paragraph({ children: [new TextRun({ text: r.value, size: 18, font: FONT, color: DARK })] })],
        }),
      ],
    })),
  });
}

/** Clean tab-separated rows — used for Education. */
function tabRow(left, right) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    tabStops: [{ type: TabStopType.RIGHT, position: BODY_WIDTH_TWIPS }],
    children: [
      new TextRun({ text: left, bold: true, size: 19, font: FONT, color: NAVY }),
      new TextRun({ text: '\t' }),
      new TextRun({ text: right, size: 17, font: FONT, color: MID, italics: true }),
    ],
  });
}

async function renderDOCX(cv) {
  const children = [];

  children.push(headerBanner(cv));
  const strip = keywordStrip(cv);
  if (strip) children.push(strip);
  children.push(gap(160));

  // ---- Professional Summary ----
  if (cv.summary) {
    children.push(...sectionTitle('Professional Summary'));
    children.push(new Paragraph({
      spacing: { after: 100 },
      alignment: AlignmentType.JUSTIFIED,
      children: [new TextRun({ text: cv.summary, size: 19, font: FONT, color: DARK })],
    }));
  }

  // ---- Core Competencies ----
  const grid = competencyGrid(cv);
  if (grid) {
    children.push(...sectionTitle('Core Competencies'));
    children.push(grid);
    children.push(gap(80));
  }

  // ---- Experience ----
  if (cv.experience?.length) {
    children.push(...sectionTitle('Experience'));
    for (const e of cv.experience) {
      const dates = `${e.start || ''} – ${e.current ? 'Present' : (e.end || '')}`;
      children.push(jobHeader(e.title, e.company, dates, e.location));
      for (const b of e.bullets || []) {
        children.push(bulletPara(b));
      }
    }
  }

  // ---- Education ----
  if (cv.education?.length) {
    children.push(...sectionTitle('Education'));
    for (const e of cv.education) {
      const right = `${e.institution || ''}${e.grade ? ' · ' + e.grade : ''} (${e.year || ''})`;
      children.push(tabRow(e.degree || '', right));
    }
    children.push(gap(80));
  }

  // ---- Technical Skills ----
  const sk = cv.skills || {};
  const techRows = [];
  if (sk.technical?.length) techRows.push({ label: 'Technical', value: sk.technical.join(' | ') });
  if (sk.languages?.length) techRows.push({ label: 'Languages', value: sk.languages.join(' | ') });
  if (techRows.length) {
    children.push(...sectionTitle('Technical Skills'));
    children.push(technicalSkillsTable(techRows));
    children.push(gap(80));
  }

  // ---- Certifications (badge pills) ----
  if (sk.certifications?.length) {
    children.push(...sectionTitle('Certifications'));
    children.push(badgeTable(sk.certifications));
    children.push(gap(80));
  }

  // ---- Additional (Awards / Projects / Volunteer) ----
  const ex = cv.extras || {};
  const hasExtras = [...(ex.awards || []), ...(ex.projects || []), ...(ex.volunteer || [])].length > 0;
  if (hasExtras) {
    children.push(...sectionTitle('Additional'));
    const group = (label, items) => {
      if (!items?.length) return;
      children.push(new Paragraph({
        spacing: { before: 60, after: 20 },
        children: [new TextRun({ text: label, bold: true, size: 19, font: FONT, color: NAVY })],
      }));
      for (const item of items) children.push(bulletPara(item));
    };
    group('Awards', ex.awards);
    group('Projects', ex.projects);
    group('Volunteer', ex.volunteer);
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 200, bottom: 720, left: PAGE_MARGIN, right: PAGE_MARGIN },
        },
      },
      children,
    }],
    styles: {
      default: { document: { run: { font: FONT, size: 18, color: DARK } } },
    },
  });

  return Packer.toBuffer(doc);
}

module.exports = { renderDOCX };
 