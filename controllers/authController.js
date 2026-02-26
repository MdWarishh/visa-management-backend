import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import logger from '../utils/logger.js';

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRES_IN || '8h',
});

const setCookie = (res, token) => res.cookie('token', token, {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge:   8 * 60 * 60 * 1000, // 8 hours
});

// ── POST /api/auth/login ──────────────────────────────
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Account locked?
    if (user.isLocked) {
      return res.status(429).json({
        success: false,
        message: `Account locked for ${user.lockMinutesLeft} minute(s). Try later.`,
      });
    }

    // Account disabled by superadmin?
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account disabled. Contact admin.' });
    }

    const match = await user.comparePassword(password);
    if (!match) {
      await user.onFailedLogin();
      const updated = await User.findById(user._id);
      const left = Math.max(0, 5 - updated.failedAttempts);

      if (updated.isLocked) {
        return res.status(429).json({ success: false, message: 'Too many attempts. Locked 15 min.' });
      }
      return res.status(401).json({
        success: false,
        message: `Invalid email or password. ${left} attempt(s) left.`,
      });
    }

    await user.onSuccessLogin();
    const token = signToken(user._id);
    setCookie(res, token);

    logger.info('Login', { email: user.email, role: user.role, ip: req.ip });

    res.json({
      success: true,
      token,
      user: {
        id:          user._id,
        name:        user.name,
        email:       user.email,
        role:        user.role,
        country:     user.country,
        permissions: user.permissions,
        lastLogin:   user.lastLogin,
      },
    });
  } catch (err) { next(err); }
};

// ── POST /api/auth/logout ─────────────────────────────
export const logout = (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out.' });
};

// ── GET /api/auth/me ──────────────────────────────────
export const getMe = async (req, res) => {
  res.json({
    success: true,
    user: {
      id:          req.user._id,
      name:        req.user.name,
      email:       req.user.email,
      role:        req.user.role,
      country:     req.user.country,
      permissions: req.user.permissions,
      lastLogin:   req.user.lastLogin,
    },
  });
};

// ── POST /api/auth/seed-superadmin ───────────────────
// Run once. Disabled if superadmin already exists.
export const seedSuperAdmin = async (req, res, next) => {
  try {
    const exists = await User.findOne({ role: 'superadmin' });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Super admin already exists.' });
    }

    const email    = process.env.SUPER_ADMIN_EMAIL    || 'superadmin@visa.com';
    const password = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@123!';

    await User.create({ name: 'Super Admin', email, password, role: 'superadmin' });

    logger.info('SuperAdmin seeded', { email });
    res.status(201).json({
      success: true,
      message: `Super admin created. Email: ${email}. Now disable this route!`,
    });
  } catch (err) { next(err); }
};
