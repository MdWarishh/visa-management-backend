import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, '../generated-visas');
const TMPL_PATH = join(__dirname, '../templates/visa-template.html');

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// DD/MM/YYYY format
const fmt = (d) => {
  if (!d) return 'N/A';
  const date = new Date(d);
  const dd = String(date.getDate()).padStart(2,'0');
  const mm = String(date.getMonth()+1).padStart(2,'0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

export const generatePdf = async (candidate) => {
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch {
    logger.warn('Puppeteer not installed. Run: npm install puppeteer');
    return null;
  }

  if (!existsSync(TMPL_PATH)) {
    logger.error('visa-template.html not found at: ' + TMPL_PATH);
    return null;
  }

  let html = readFileSync(TMPL_PATH, 'utf-8');

  // Replace all template variables
  const vars = {
    '{{COMPANY_NAME}}':      process.env.COMPANY_NAME || 'Israel Police Visa Immigration Services',
    '{{APPLICANT_NAME}}':    (candidate.fullName || '').toUpperCase(),
    '{{APP_NUMBER}}':        candidate.applicationNumber || '',
    '{{PASSPORT_NUMBER}}':   candidate.passportNumber || '',
    '{{VISA_NUMBER}}':       candidate.visaNumber || '',
    '{{FULL_NAME}}':         candidate.fullName || '',
    '{{DOB}}':               fmt(candidate.dateOfBirth),
    '{{PROFESSION}}':        (candidate.profession || '').toUpperCase(),
    '{{COMPANY}}':           (candidate.companyName || '').toUpperCase(),
    '{{VISA_ISSUE_DATE}}':   fmt(candidate.visaIssueDate),
    '{{VISA_EXPIRY_DATE}}':  fmt(candidate.visaExpiryDate),
    '{{VISA_TYPE}}':         (candidate.visaType || '').toUpperCase(),
    '{{COUNTRY}}':           (candidate.country || '').toUpperCase(),
    '{{STATUS}}':            (candidate.status || '').toUpperCase(),
    '{{MESSAGE}}':           (candidate.message || '').toUpperCase(),
  };

  for (const [k, v] of Object.entries(vars)) {
    html = html.replaceAll(k, v);
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfPath = join(OUT_DIR, `${candidate.applicationNumber}.pdf`);
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top:'8mm', right:'8mm', bottom:'8mm', left:'8mm' }
    });
    logger.info('PDF generated', { app: candidate.applicationNumber });
    return pdfPath;
  } finally {
    await browser.close();
  }
};
