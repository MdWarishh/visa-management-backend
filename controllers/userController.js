import User from '../models/User.js';
import logger from '../utils/logger.js';

// ── GET /api/users ────────────────────────────────────
// Admin apne users dekhe
export const getMyUsers = async (req, res, next) => {
  try {
    const users = await User.find({
      createdBy: req.user._id,
      role: 'user',
    })
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: users });
  } catch (err) { next(err); }
};

// ── POST /api/users ───────────────────────────────────
// Admin naya user banaye — name, email, password, permissions
export const createUser = async (req, res, next) => {
  try {
    const { name, email, password, permissions } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password required.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password min 6 characters.',
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    // Permissions — sirf allowed fields
    const perms = {
      canView:     true, // hamesha true
      canAdd:      permissions?.canAdd     ?? false,
      canEdit:     permissions?.canEdit    ?? false,
      canDelete:   permissions?.canDelete  ?? false,
      canExport:   permissions?.canExport  ?? false,
      canDownload: permissions?.canDownload ?? false,
    };

    const user = await User.create({
      name:        name.trim(),
      email:       email.toLowerCase().trim(),
      password,
      role:        'user',
      country:     req.user.country, // parent admin ka country inherit
      createdBy:   req.user._id,
      permissions: perms,
    });

    logger.info('User created', { by: req.user.email, user: user.email });

    res.status(201).json({
      success: true,
      message: `User "${user.name}" created.`,
      data: {
        id:          user._id,
        name:        user.name,
        email:       user.email,
        country:     user.country,
        permissions: user.permissions,
        isActive:    user.isActive,
      },
    });
  } catch (err) { next(err); }
};

// ── PUT /api/users/:id ────────────────────────────────
// Admin apne user ki permissions ya info update kare
export const updateUser = async (req, res, next) => {
  try {
    const { name, password, isActive, permissions } = req.body;

    // Sirf apna user update kar sakta hai
    const user = await User.findOne({
      _id:       req.params.id,
      createdBy: req.user._id,
      role:      'user',
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (name) user.name = name.trim();
    if (isActive !== undefined) user.isActive = Boolean(isActive);

    // Password reset
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password min 6 chars.' });
      }
      user.password = password;
      user.failedAttempts = 0;
      user.lockUntil = 0;
    }

    // Permissions update
    if (permissions) {
      user.permissions.canView     = true; // hamesha true
      user.permissions.canAdd      = permissions.canAdd      ?? user.permissions.canAdd;
      user.permissions.canEdit     = permissions.canEdit     ?? user.permissions.canEdit;
      user.permissions.canDelete   = permissions.canDelete   ?? user.permissions.canDelete;
      user.permissions.canExport   = permissions.canExport   ?? user.permissions.canExport;
      user.permissions.canDownload = permissions.canDownload ?? user.permissions.canDownload;
      user.markModified('permissions');
    }

    await user.save();
    logger.info('User updated', { by: req.user.email, user: user.email });

    res.json({
      success: true,
      message: 'User updated.',
      data: {
        id:          user._id,
        name:        user.name,
        email:       user.email,
        permissions: user.permissions,
        isActive:    user.isActive,
      },
    });
  } catch (err) { next(err); }
};

// ── DELETE /api/users/:id ─────────────────────────────
// Admin apna user delete kare
export const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findOneAndDelete({
      _id:       req.params.id,
      createdBy: req.user._id,
      role:      'user',
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    logger.info('User deleted', { by: req.user.email, user: user.email });
    res.json({ success: true, message: `User "${user.name}" deleted.` });
  } catch (err) { next(err); }
};
