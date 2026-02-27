import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect, requireRole, requirePermission, scopeAdmin } from '../middleware/auth.js';
import { candidateUpload } from '../middleware/upload.js';
import {
  getStats, getAll, getOne, addCandidate, editCandidate,
  deleteCandidate, exportExcel, downloadVisa,
  trackVisa, publicVisaDoc,
} from '../controllers/candidateController.js';

const router = express.Router();

const trackLimiter = rateLimit({
  windowMs: 60 * 1000, max: 20,
  handler: (req, res) => res.status(429).json({ success: false, message: 'Too many requests. Try after a minute.' }),
});

// ── PUBLIC routes ─────────────────────────────────────
router.post('/public/track',              trackLimiter, trackVisa);
router.get('/public/visa-doc/:id',        trackLimiter, publicVisaDoc);

// ── PROTECTED routes ──────────────────────────────────
router.use(protect);
router.use(requireRole('superadmin', 'admin', 'user'));
router.use(scopeAdmin);

router.get('/stats',                             getStats);
router.get('/export/excel',    requirePermission('canExport'),   exportExcel);
router.get('/admin/download/:id', requirePermission('canDownload'), downloadVisa);

// CRUD
router.get('/',       getAll);
router.post('/',      requirePermission('canAdd'),    candidateUpload, addCandidate);
router.get('/:id',    getOne);
router.put('/:id',    requirePermission('canEdit'),   candidateUpload, editCandidate);
router.delete('/:id', requirePermission('canDelete'), deleteCandidate);

export default router;
