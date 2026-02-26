import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// ── Permissions schema ────────────────────────────────
// Sirf 'user' role ke liye relevant
// Admin/SuperAdmin ke paas sab permissions hote hain
const permissionsSchema = new mongoose.Schema({
  canAdd:     { type: Boolean, default: false }, // Application add karna
  canEdit:    { type: Boolean, default: false }, // Application edit karna
  canDelete:  { type: Boolean, default: false }, // Application delete karna
  canExport:  { type: Boolean, default: false }, // Excel export karna
  canDownload:{ type: Boolean, default: false }, // Visa PDF download karna
  canView:    { type: Boolean, default: true  }, // Applications dekhna (always true)
}, { _id: false });

const userSchema = new mongoose.Schema({
  // ── Identity ──────────────────────────────────────
  name:  { type: String, required: [true, 'Name required'], trim: true },
  email: {
    type: String, required: [true, 'Email required'],
    unique: true, lowercase: true, trim: true,
  },
  password: { type: String, required: [true, 'Password required'] },

  // ── Role ─────────────────────────────────────────
  // superadmin: platform ka maalik — sab kuch kar sakta hai
  // admin: ek country manage karta hai, users banata hai
  // user: admin ne banaya, sirf allowed kaam kar sakta hai
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'user'],
    required: true,
  },

  // ── Admin/User fields ─────────────────────────────
  country: { type: String, trim: true, default: '' }, // Admin ka country
  phone:   { type: String, trim: true, default: '' },

  // ── Hierarchy ─────────────────────────────────────
  // User ka parent admin kaun hai
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },

  // ── Permissions (sirf user role ke liye) ──────────
  permissions: { type: permissionsSchema, default: () => ({}) },

  // ── Status ────────────────────────────────────────
  isActive: { type: Boolean, default: true },

  // ── Login tracking ────────────────────────────────
  lastLogin:      { type: Date, default: null },
  failedAttempts: { type: Number, default: 0  },
  lockUntil:      { type: Number, default: 0  }, // Unix timestamp ms

}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────
userSchema.index({ email: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ createdBy: 1 });

// ── Hash password ─────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Compare password ──────────────────────────────────
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// ── Is account locked? ────────────────────────────────
userSchema.virtual('isLocked').get(function () {
  return this.lockUntil > Date.now();
});

userSchema.virtual('lockMinutesLeft').get(function () {
  if (!this.isLocked) return 0;
  return Math.ceil((this.lockUntil - Date.now()) / 60000);
});

// ── Handle failed login ───────────────────────────────
userSchema.methods.onFailedLogin = async function () {
  this.failedAttempts += 1;
  if (this.failedAttempts >= 5) {
    this.lockUntil = Date.now() + 15 * 60 * 1000; // 15 min lock
  }
  await this.save();
};

// ── Handle successful login ───────────────────────────
userSchema.methods.onSuccessLogin = async function () {
  this.failedAttempts = 0;
  this.lockUntil = 0;
  this.lastLogin = new Date();
  await this.save();
};

// ── Check if user has a specific permission ───────────
// Admin aur SuperAdmin ke paas sab permissions hain
userSchema.methods.hasPermission = function (perm) {
  if (this.role === 'superadmin' || this.role === 'admin') return true;
  return this.permissions?.[perm] === true;
};

const User = mongoose.model('User', userSchema);
export default User;
