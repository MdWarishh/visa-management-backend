import multer from 'multer';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ensureDir = (dir) => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
};

// ── Storage config ────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subDir = 'misc';

    // Fieldname ke hisaab se alag folder
    if (file.fieldname === 'passportCopy')         subDir = 'passports';
    else if (file.fieldname === 'photo')           subDir = 'photos';
    else if (file.fieldname === 'supportingDocuments') subDir = 'supporting';

    const fullDir = join(__dirname, '../uploads', subDir);
    ensureDir(fullDir);
    cb(null, fullDir);
  },

  filename: (req, file, cb) => {
    // Original filename nahi — UUID use karo (security)
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

// ── File type filter ──────────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const extOk  = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = allowedTypes.test(file.mimetype);

  if (extOk && mimeOk) {
    return cb(null, true);
  }
  cb(new Error('Invalid file type. Only JPG, PNG, PDF allowed.'));
};

// ── Upload middleware export ──────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,   // 5MB per file
    files: 12,                    // max 12 files total
  },
});

// ── Candidate document upload config ─────────────────────────────
// passportCopy: 1 file
// photo: 1 file
// supportingDocuments: up to 10 files
export const candidateUpload = upload.fields([
  { name: 'passportCopy',         maxCount: 1  },
  { name: 'photo',                maxCount: 1  },
  { name: 'supportingDocuments',  maxCount: 10 },
]);

export default upload;
