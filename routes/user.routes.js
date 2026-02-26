import express from 'express';
import { protect, requireRole } from '../middleware/auth.js';
import { getMyUsers, createUser, updateUser, deleteUser } from '../controllers/userController.js';

const router = express.Router();

// Only admin can manage users
router.use(protect);
router.use(requireRole('admin'));

router.get('/',     getMyUsers);
router.post('/',    createUser);
router.put('/:id',  updateUser);
router.delete('/:id', deleteUser);

export default router;
