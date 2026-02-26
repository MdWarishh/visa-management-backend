import express from 'express';
import rateLimit from 'express-rate-limit';
import { login, logout, getMe, seedSuperAdmin } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000, max: 5,
  handler: (req, res) => res.status(429).json({ success: false, message: 'Too many attempts. Wait 1 minute.' }),
});

router.post('/login',           loginLimiter, login);
router.post('/logout',          protect, logout);
router.get('/me',               protect, getMe);
// Run once then disable/remove
router.post('/seed-superadmin', seedSuperAdmin);

export default router;
