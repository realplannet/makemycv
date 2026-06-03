const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');
const path = require('path');

/**
 * Generates a .docx CV from structured CV data.
 * Uses a master DOCX template at templates/master.docx.
 * Falls back to programmatic generation if template not found.
 */
async function renderDOCX(cvData) {
  const templatePath = path.join(__dirname, '..', 'templates', 'master.docx');

  if (fs.existsSync(templatePath)) {
    // Use docxtemplater with existing template
    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    const flatData = flattenForDocx(cvData);
    doc.render(flatData);

    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    return buf;
  }

  // Programmatic fallback: build DOCX using basic XML
  return buildDocxFromScratch(cvData);
}

function flattenForDocx(cv) {
  return {
    name: cv.name || '',
    title: cv.title || '',
    email: cv.email || '',
    phone: cv.phone || '',
    location: cv.location || '',
    linkedin: cv.linkedin || '',
    portfolio: cv.portfolio || '',
    summary: cv.summary || '',
    experience: (cv.experience || []).map(e => ({
      ...e,
      bullets_text: (e.bullets || []).join('\n'),
      period: `${e.start} – ${e.current ? 'Present' : e.end}`,
    })),
    education: (cv.education || []).map(e => ({
      ...e,
      grade: e.grade || '',
    })),
    skills_technical: (cv.skills?.technical || []).join(', '),
    skills_soft: (cv.skills?.soft || []).join(', '),
    skills_languages: (cv.skills?.languages || []).join(', '),
    skills_certifications: (cv.skills?.certifications || []).join(', '),
    extras_awards: (cv.extras?.awards || []).join('\n'),
    extras_projects: (cv.extras?.projects || []).join('\n'),
    extras_volunteer: (cv.extras?.volunteer || []).join('\n'),
  };
}

// Builds a clean, ATS-safe DOCX from scratch using Open XML
function buildDocxFromScratch(cv) {
  const lines = [];

  const push = (text, style = 'Normal') => lines.push({ text, style });

  push(cv.name || '', 'Heading1');
  push(`${cv.title || ''} | ${cv.email || ''} | ${cv.phone || ''} | ${cv.location || ''}`, 'Subtitle');
  if (cv.linkedin) push(cv.linkedin, 'Normal');
  push('', 'Normal');

  if (cv.summary) {
    push('PROFESSIONAL SUMMARY', 'Heading2');
    push(cv.summary, 'Normal');
    push('', 'Normal');
  }

  if (cv.experience?.length) {
    push('EXPERIENCE', 'Heading2');
    for (const e of cv.experience) {
      push(`${e.title} — ${e.company}`, 'Heading3');
      push(`${e.start} – ${e.current ? 'Present' : e.end}`, 'Normal');
      for (const b of e.bullets || []) push(`• ${b}`, 'Normal');
      push('', 'Normal');
    }
  }

  if (cv.education?.length) {
    push('EDUCATION', 'Heading2');
    for (const e of cv.education) {
      push(`${e.institution} — ${e.degree}${e.grade ? ` (${e.grade})` : ''}`, 'Normal');
      push(e.year || '', 'Normal');
    }
    push('', 'Normal');
  }

  if (cv.skills) {
    push('SKILLS', 'Heading2');
    if (cv.skills.technical?.length)     push(`Technical: ${cv.skills.technical.join(', ')}`, 'Normal');
    if (cv.skills.soft?.length)          push(`Soft Skills: ${cv.skills.soft.join(', ')}`, 'Normal');
    if (cv.skills.certifications?.length) push(`Certifications: ${cv.skills.certifications.join(', ')}`, 'Normal');
    if (cv.skills.languages?.length)     push(`Languages: ${cv.skills.languages.join(', ')}`, 'Normal');
    push('', 'Normal');
  }

  const ex = cv.extras || {};
  const hasExtras = [...(ex.awards||[]), ...(ex.projects||[]), ...(ex.volunteer||[])].length > 0;
  if (hasExtras) {
    push('ADDITIONAL', 'Heading2');
    for (const a of ex.awards  || []) push(`Award: ${a}`, 'Normal');
    for (const p of ex.projects|| []) push(`Project: ${p}`, 'Normal');
    for (const v of ex.volunteer||[]) push(`Volunteer: ${v}`, 'Normal');
  }

  return buildRawDocx(lines);
}

function buildRawDocx(lines) {
  const styleMap = {
    Heading1: `<w:rPr><w:b/><w:sz w:val="44"/></w:rPr>`,
    Heading2: `<w:rPr><w:b/><w:sz w:val="24"/><w:caps/></w:rPr>`,
    Heading3: `<w:rPr><w:b/><w:sz w:val="22"/></w:rPr>`,
    Subtitle: `<w:rPr><w:sz w:val="20"/><w:color w:val="555555"/></w:rPr>`,
    Normal:   `<w:rPr><w:sz w:val="20"/></w:rPr>`,
  };

  const paras = lines.map(({ text, style }) => {
    const spacing = style === 'Heading2'
      ? `<w:pPr><w:spacing w:before="160" w:after="60"/></w:pPr>`
      : `<w:pPr><w:spacing w:before="0" w:after="40"/></w:pPr>`;
    const rpr = styleMap[style] || styleMap.Normal;
    const escaped = String(text)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<w:p>${spacing}<w:r>${rpr}<w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
  }).join('\n');

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paras}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
    <w:sz w:val="20"/>
  </w:rPr></w:rPrDefault></w:docDefaults>
</w:styles>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const zip = new PizZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', rootRelsXml);
  zip.file('word/document.xml', docXml);
  zip.file('word/styles.xml', stylesXml);
  zip.file('word/_rels/document.xml.rels', relsXml);

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { renderDOCX };
