// Force @sparticuz/chromium's AWS-Lambda environment detection to fire on Vercel.
// Vercel's Node.js runtime does NOT expose AWS_EXECUTION_ENV/AWS_LAMBDA_JS_RUNTIME
// in the exact form the package checks for, so its internal auto-extraction of the
// missing shared libraries (libnss3.so, libnspr4.so, etc.) and its own correct
// LD_LIBRARY_PATH setup never run — this is what causes
// "/tmp/chromium: error while loading shared libraries: libnss3.so: cannot open
// shared object file" in production. We fake the signal based on the ACTUAL
// Node.js major version this function is executing under, picked up from
// process.version (always accurate, regardless of what Vercel sets/doesn't set).
// This MUST run before `require('@sparticuz/chromium')` since the package reads
// these env vars at module-load time (setting them after require() is too late).
if (!process.env.AWS_LAMBDA_JS_RUNTIME && !process.env.AWS_EXECUTION_ENV) {
  const nodeMajor = parseInt(process.version.slice(1).split('.')[0], 10);
  process.env.AWS_LAMBDA_JS_RUNTIME = nodeMajor >= 20 ? 'nodejs20.x' : 'nodejs18.x';
}

const puppeteer = require('puppeteer-core');
const chromium  = require('@sparticuz/chromium');
const fs = require('fs');
const path = require('path');

const TEMPLATES = ['classic', 'modern', 'executive', 'minimal', 'creative'];

// Templates live at project root /templates/ — resolve from here
const TEMPLATES_DIR = path.join(process.cwd(), 'templates');

function prepareTemplateData(cvData) {
  const d = { ...cvData };
  const nameParts = (d.name || '').split(' ');
  d.initials = nameParts.length >= 2
    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    : (d.name || 'U')[0].toUpperCase();

  if (d.skills) {
    d.skills = { ...d.skills };
    d.skills.technical_str      = (d.skills.technical      || []).join(' · ');
    d.skills.soft_str            = (d.skills.soft            || []).join(' · ');
    d.skills.languages_str       = (d.skills.languages       || []).join(' · ');
    d.skills.certifications_str  = (d.skills.certifications  || []).join(' · ');
  }

  const ex = d.extras || {};
  d.hasExtras = (
    (ex.awards    || []).length > 0 ||
    (ex.projects  || []).length > 0 ||
    (ex.volunteer || []).length > 0
  );
  return d;
}

function renderTemplate(template, data) {
  let html = template;

  html = html.replace(/\{\{#(\w+)\.length\}\}([\s\S]*?)\{\{\/\1\.length\}\}/g, (_, key, inner) => {
    const val = data[key];
    return (Array.isArray(val) && val.length > 0) ? inner : '';
  });

  html = html.replace(/\{\{#(\w+(?:\.\w+)?)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, inner) => {
    const val = getNestedVal(data, key);
    if (!val || (Array.isArray(val) && val.length === 0)) return '';
    if (Array.isArray(val)) {
      return val.map(item => {
        if (typeof item === 'object') return renderTemplate(inner, { ...data, ...item });
        return renderTemplate(inner, { ...data, '.': item });
      }).join('');
    }
    return renderTemplate(inner, { ...data, [key]: val });
  });

  html = html.replace(/\{\{\^(\w+(?:\.\w+)?)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, inner) => {
    const val = getNestedVal(data, key);
    if (!val || (Array.isArray(val) && val.length === 0)) return inner;
    return '';
  });

  html = html.replace(/\{\{\.\}\}/g, () => data['.'] || '');
  html = html.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => {
    const val = getNestedVal(data, key);
    return val !== undefined && val !== null ? String(val) : '';
  });

  return html;
}

function getNestedVal(obj, path) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

async function renderPDF(cvData, templateName) {
  if (!TEMPLATES.includes(templateName)) throw new Error(`Unknown template: ${templateName}`);

  const templatePath = path.join(TEMPLATES_DIR, `${templateName}.html`);
  const templateHtml = fs.readFileSync(templatePath, 'utf8');
  const data = prepareTemplateData(cvData);
  const html = renderTemplate(templateHtml, data);

  // Serverless Chromium setup (Vercel/AWS Lambda).
  // Disable WebGL (not needed for static HTML->PDF, saves ~1s cold start).
  chromium.setGraphicsMode = false;

  const executablePath = await chromium.executablePath();

  // Belt-and-suspenders: @sparticuz/chromium should now set LD_LIBRARY_PATH itself
  // (to /tmp/al2/lib or /tmp/al2023/lib) thanks to the env shim above, since that's
  // where it actually extracts libnss3.so etc. We additionally prepend the
  // executable's own directory in case any future version also drops libs there.
  const execDir = path.dirname(executablePath);
  process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
    ? `${execDir}:${process.env.LD_LIBRARY_PATH}`
    : execDir;

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

module.exports = { renderPDF };
