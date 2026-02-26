import jwt from 'jsonwebtoken';
import Admin from '../models/admin.model.js';
import logger from '../utils/logger.js';

export const authMiddleware = async (req, res, next) => {
  try {
    let token = null;

    // ── Step 1: Authorization header check karo (Bearer token) ───
    // Frontend localStorage se yahi bhejta hai:
    // headers: { Authorization: 'Bearer <token>' }
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    // ── Step 2: Fallback — httpOnly cookie check karo ────────────
    // Browser automatically cookie bhejta hai
    if (!token && req.cookies?.jwt) {
      token = req.cookies.jwt;
    }

    // ── No token found ────────────────────────────────────────────
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Please login first.',
      });
    }

    // ── Verify token ──────────────────────────────────────────────
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ── Find admin in DB ──────────────────────────────────────────
    const admin = await Admin.findById(decoded.id).select('-password');
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Admin account not found. Please login again.',
      });
    }

    // ── Attach to request ─────────────────────────────────────────
    req.admin = admin;
    next();
  } catch (error) {
    logger.warn('Auth middleware error', { error: error.message, path: req.path });

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please login again.',
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid token. Please login again.',
    });
  }
};
