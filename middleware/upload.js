import multer from 'multer';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure upload directories exist
const dirs = ['photos', 'visa-docs'].map(d => join(__dirname, '../uploads', d));
dirs.forEach(d => { if (!existsSync(d)) mkdirSync(d, { recursive: true }); });

// ── PHOTO storage (jpg/png only) ──
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, join(__dirname, '../uploads/photos')),
  filename:    (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname).toLowerCase()}`),
});

// ── VISA DOC storage (jpg/png/pdf) ──
const visaDocStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, join(__dirname, '../uploads/visa-docs')),
  filename:    (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname).toLowerCase()}`),
});

const photoFilter = (req, file, cb) => {
  const ok = /jpeg|jpg|png/.test(path.extname(file.originalname).toLowerCase());
  ok ? cb(null, true) : cb(new Error('Photo: only JPG/PNG allowed'));
};

const visaDocFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const ok = /jpeg|jpg|png|pdf/.test(ext);
  ok ? cb(null, true) : cb(new Error('Visa doc: only JPG/PNG/PDF allowed'));
};

// Combined upload for candidate form
const candidateMulter = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (file.fieldname === 'photo') {
        cb(null, join(__dirname, '../uploads/photos'));
      } else {
        cb(null, join(__dirname, '../uploads/visa-docs'));
      }
    },
    filename: (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'photo') {
      /jpeg|jpg|png/.test(ext) ? cb(null, true) : cb(new Error('Photo: JPG/PNG only'));
    } else {
      /jpeg|jpg|png|pdf/.test(ext) ? cb(null, true) : cb(new Error('Visa doc: JPG/PNG/PDF only'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

export const candidateUpload = candidateMulter.fields([
  { name: 'photo',       maxCount: 1 },
  { name: 'visaDocument', maxCount: 1 },
]);

export default candidateMulter;
