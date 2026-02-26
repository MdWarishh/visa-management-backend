import express from 'express';
import { protect, requireRole } from '../middleware/auth.js';
import {
  getAllAdmins, createAdmin, updateAdmin,
  toggleAdminStatus, getAdminDetail, getPlatformStats,
} from '../controllers/superAdminController.js';

const router = express.Router();

// All superadmin routes — protected + superadmin only
router.use(protect);
router.use(requireRole('superadmin'));

router.get('/stats',         getPlatformStats);
router.get('/admins',        getAllAdmins);
router.post('/admins',       createAdmin);
router.get('/admins/:id',    getAdminDetail);
router.put('/admins/:id',    updateAdmin);
router.patch('/admins/:id/toggle', toggleAdminStatus);

export default router;
