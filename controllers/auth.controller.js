import jwt from 'jsonwebtoken';
import Admin from '../models/admin.model.js';
import logger from '../utils/logger.js';

// ── Strong password regex ─────────────────────────────────────────
// Min 8 chars, uppercase, lowercase, number, special char
const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/;

// ── Generate JWT ──────────────────────────────────────────────────
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  });

// ── Set httpOnly cookie ───────────────────────────────────────────
const sendCookie = (res, token) => {
  res.cookie('jwt', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge:   60 * 60 * 1000,  // 1 hour
  });
};

// ── POST /api/auth/login ──────────────────────────────────────────
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email aur password dono required hain.',
      });
    }

    // Admin find karo
    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (!admin) {
      logger.warn('Login: admin not found', { email, ip: req.ip });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Account locked check
    if (admin.isLocked) {
      logger.warn('Login: account locked', { email, ip: req.ip });
      return res.status(429).json({
        success: false,
        message: `Account ${admin.lockRemainingMinutes} minute(s) ke liye locked hai. Baad mein try karo.`,
      });
    }

    // Password compare
    const isMatch = await admin.comparePassword(password);

    if (!isMatch) {
      await admin.handleFailedLogin();

      // Fresh data lao
      const updated = await Admin.findById(admin._id);
      const attemptsLeft = Math.max(0, 5 - updated.failedAttempts);

      logger.warn('Login: wrong password', { email, ip: req.ip, failedAttempts: updated.failedAttempts });

      if (updated.isLocked) {
        return res.status(429).json({
          success: false,
          message: 'Zyada galat attempts. Account 15 minute ke liye lock ho gaya.',
        });
      }

      return res.status(401).json({
        success: false,
        message: `Invalid email or password. ${attemptsLeft} attempt(s) bache hain.`,
      });
    }

    // ── Successful login ─────────────────────────────────────────
    await admin.handleSuccessfulLogin();
    const token = signToken(admin._id);

    // httpOnly cookie set karo (browser ke liye)
    sendCookie(res, token);

    logger.info('Login successful', { email, ip: req.ip });

    // FIX: Token body mein bhi bhejo — frontend localStorage mein store karega
    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,               // ← localStorage ke liye
      admin: {
        id:        admin._id,
        email:     admin.email,
        lastLogin: admin.lastLogin,
      },
    });
  } catch (error) {
    next(error);  // Global error handler mein bhejo
  }
};

// ── POST /api/auth/logout ─────────────────────────────────────────
export const logout = (req, res) => {
  res.clearCookie('jwt');
  res.json({ success: true, message: 'Logged out successfully.' });
};

// ── GET /api/auth/me ──────────────────────────────────────────────
// FIX: Ye route missing tha — frontend session verify karta hai isse
export const getMe = async (req, res) => {
  res.json({
    success: true,
    admin: {
      id:        req.admin._id,
      email:     req.admin.email,
      lastLogin: req.admin.lastLogin,
    },
  });
};

// ── POST /api/auth/register ───────────────────────────────────────
// Sirf PEHLI BAAR admin banana ke liye
// Production mein is route ko REMOVE karo ya strong guard lagao
export const register = async (req, res, next) => {
  try {
    // FIX: Pehle check karo koi admin hai ya nahi
    const adminCount = await Admin.countDocuments();
    if (adminCount > 0) {
      return res.status(403).json({
        success: false,
        message: 'Admin already exists. Registration disabled.',
      });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email aur password required hain.',
      });
    }

    // Strong password check
    if (!STRONG_PASSWORD.test(password)) {
      return res.status(400).json({
        success: false,
        message:
          'Password weak hai. Min 8 chars + uppercase + lowercase + number + special character chahiye.',
      });
    }

    const admin = await Admin.create({ email: email.toLowerCase().trim(), password });

    logger.info('Admin registered', { email });

    res.status(201).json({
      success: true,
      message: 'Admin account created. Ab is route ko disable karo production mein!',
      admin: { id: admin._id, email: admin.email },
    });
  } catch (error) {
    next(error);
  }
};
