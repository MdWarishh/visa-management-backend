import User from '../models/User.js';
import Candidate from '../models/Candidate.js';
import logger from '../utils/logger.js';

// ── GET /api/superadmin/admins ────────────────────────
// Saare admins ki list
export const getAllAdmins = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', isActive = '' } = req.query;

    const query = { role: 'admin' };
    if (search.trim()) {
      query.$or = [
        { name:    { $regex: search.trim(), $options: 'i' } },
        { email:   { $regex: search.trim(), $options: 'i' } },
        { country: { $regex: search.trim(), $options: 'i' } },
      ];
    }
    if (isActive !== '') query.isActive = isActive === 'true';

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const [admins, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    // Har admin ke liye candidate count bhi bhejo
    const adminIds = admins.map(a => a._id);
    const counts = await Candidate.aggregate([
      { $match: { adminId: { $in: adminIds }, isDeleted: false } },
      { $group: { _id: '$adminId', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach(c => { countMap[c._id.toString()] = c.count; });

    const enriched = admins.map(a => ({
      ...a,
      candidateCount: countMap[a._id.toString()] || 0,
    }));

    res.json({
      success: true,
      data: enriched,
      pagination: {
        current: parseInt(page),
        limit:   parseInt(limit),
        total,
        pages:   Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) { next(err); }
};

// ── POST /api/superadmin/admins ───────────────────────
// Naya admin create karo
export const createAdmin = async (req, res, next) => {
  try {
    const { name, email, password, country, phone } = req.body;

    if (!name || !email || !password || !country) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, country — sab required hain.',
      });
    }

    // Password strength
    const strongPw = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/;
    if (!strongPw.test(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password weak. Min 8 chars + uppercase + lowercase + number + special char.',
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const admin = await User.create({
      name:      name.trim(),
      email:     email.toLowerCase().trim(),
      password,
      country:   country.trim(),
      phone:     phone?.trim() || '',
      role:      'admin',
      createdBy: req.user._id,
    });

    logger.info('Admin created', { by: req.user.email, newAdmin: admin.email, country: admin.country });

    res.status(201).json({
      success: true,
      message: `Admin "${admin.name}" created successfully.`,
      data: {
        id:      admin._id,
        name:    admin.name,
        email:   admin.email,
        country: admin.country,
        phone:   admin.phone,
        role:    admin.role,
      },
    });
  } catch (err) { next(err); }
};

// ── PUT /api/superadmin/admins/:id ────────────────────
// Admin info update karo
export const updateAdmin = async (req, res, next) => {
  try {
    const { name, country, phone, isActive, password } = req.body;

    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found.' });
    }

    if (name)      admin.name    = name.trim();
    if (country)   admin.country = country.trim();
    if (phone !== undefined) admin.phone = phone.trim();
    if (isActive !== undefined) admin.isActive = Boolean(isActive);

    // Password reset
    if (password) {
      const strongPw = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/;
      if (!strongPw.test(password)) {
        return res.status(400).json({ success: false, message: 'Password too weak.' });
      }
      admin.password = password;
      admin.failedAttempts = 0;
      admin.lockUntil = 0;
    }

    await admin.save();
    logger.info('Admin updated', { by: req.user.email, admin: admin.email });

    res.json({
      success: true,
      message: 'Admin updated.',
      data: { id: admin._id, name: admin.name, email: admin.email, country: admin.country, isActive: admin.isActive },
    });
  } catch (err) { next(err); }
};

// ── DELETE /api/superadmin/admins/:id ────────────────
// Admin disable karo (soft — unka data preserve rahega)
export const toggleAdminStatus = async (req, res, next) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found.' });

    admin.isActive = !admin.isActive;
    await admin.save();

    logger.info('Admin status toggled', { by: req.user.email, admin: admin.email, isActive: admin.isActive });

    res.json({
      success: true,
      message: `Admin ${admin.isActive ? 'enabled' : 'disabled'} successfully.`,
      isActive: admin.isActive,
    });
  } catch (err) { next(err); }
};

// ── GET /api/superadmin/admins/:id ───────────────────
// Single admin detail + uske users + candidate count
export const getAdminDetail = async (req, res, next) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: 'admin' }).select('-password').lean();
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found.' });

    // Uske users
    const users = await User.find({ createdBy: admin._id, role: 'user' })
      .select('-password')
      .lean();

    // Candidate stats
    const stats = await Candidate.aggregate([
      { $match: { adminId: admin._id, isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const statMap = {};
    stats.forEach(s => { statMap[s._id] = s.count; });
    const total = Object.values(statMap).reduce((a, b) => a + b, 0);

    res.json({
      success: true,
      data: {
        ...admin,
        users,
        stats: { total, ...statMap },
      },
    });
  } catch (err) { next(err); }
};

// ── GET /api/superadmin/stats ─────────────────────────
// Overall platform stats
export const getPlatformStats = async (req, res, next) => {
  try {
    const [totalAdmins, activeAdmins, totalUsers, totalCandidates, issuedVisas] = await Promise.all([
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'admin', isActive: true }),
      User.countDocuments({ role: 'user' }),
      Candidate.countDocuments({ isDeleted: false }),
      Candidate.countDocuments({ status: 'Issued', isDeleted: false }),
    ]);

    res.json({
      success: true,
      stats: { totalAdmins, activeAdmins, totalUsers, totalCandidates, issuedVisas },
    });
  } catch (err) { next(err); }
};
