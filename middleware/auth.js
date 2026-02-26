import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import logger from '../utils/logger.js';

// ── Verify JWT — attach user to req ───────────────────
export const protect = async (req, res, next) => {
  try {
    let token = null;

    // 1. Bearer header
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) token = auth.split(' ')[1];

    // 2. Cookie fallback
    if (!token && req.cookies?.token) token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Please login first.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Account not found.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account disabled. Contact admin.' });
    }

    req.user = user;
    next();
  } catch (err) {
    logger.warn('Auth middleware error', { error: err.message });
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Login again.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

// ── Role guard — allow specific roles only ────────────
// Usage: requireRole('superadmin') or requireRole('superadmin', 'admin')
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated.' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Required role: ${roles.join(' or ')}.`,
    });
  }
  next();
};

// ── Permission guard — for 'user' role specific actions ──
// Admin/SuperAdmin bypass karte hain — unhe sab allowed hai
// Usage: requirePermission('canAdd') or requirePermission('canEdit')
export const requirePermission = (perm) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated.' });

  if (req.user.hasPermission(perm)) return next();

  return res.status(403).json({
    success: false,
    message: `Permission denied. You don't have '${perm}' access.`,
  });
};

// ── Admin scope — user sirf apne admin ka data dekhe ──
// Adds adminId filter to all candidate queries
// SuperAdmin: koi bhi adminId se filter kar sakta hai (query param se)
// Admin: sirf apna data
// User: sirf apne parent admin ka data
export const scopeAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated.' });

  const { role, _id, createdBy } = req.user;

  if (role === 'superadmin') {
    // SuperAdmin: URL query ?adminId=xxx se kisi ka bhi data dekh sakta hai
    // Ya sab candidates ek saath
    req.adminScope = req.query.adminId || null; // null = all
  } else if (role === 'admin') {
    req.adminScope = _id.toString();
  } else {
    // user: apne parent admin ka scope
    req.adminScope = createdBy?.toString() || null;
  }

  next();
};
