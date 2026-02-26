import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const adminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
    },

    // Login attempt tracking
    failedAttempts: { type: Number, default: 0 },
    lockUntil: { type: Number, default: 0 },  // Unix timestamp (milliseconds)

    // Activity tracking
    lastLogin: { type: Date, default: null },
  },
  {
    timestamps: true,  // FIX: createdAt / updatedAt auto add
  }
);

// ── Hash password before save ─────────────────────────────────────
// FIX: next() parameter add kiya
adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);  // 12 rounds (more secure than 10)
  next();
});

// ── Compare password ──────────────────────────────────────────────
adminSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ── Virtual: Is account locked? ───────────────────────────────────
// FIX: Virtual getter add kiya
adminSchema.virtual('isLocked').get(function () {
  return this.lockUntil > Date.now();
});

// ── Virtual: Minutes remaining in lock ───────────────────────────
adminSchema.virtual('lockRemainingMinutes').get(function () {
  if (!this.isLocked) return 0;
  return Math.ceil((this.lockUntil - Date.now()) / 60000);
});

// ── Handle failed login ───────────────────────────────────────────
adminSchema.methods.handleFailedLogin = async function () {
  this.failedAttempts += 1;
  if (this.failedAttempts >= 5) {
    this.lockUntil = Date.now() + 15 * 60 * 1000;  // 15 minutes
  }
  await this.save();
};

// ── Handle successful login ───────────────────────────────────────
adminSchema.methods.handleSuccessfulLogin = async function () {
  this.failedAttempts = 0;
  this.lockUntil = 0;
  this.lastLogin = new Date();
  await this.save();
};

const Admin = mongoose.model('Admin', adminSchema);
export default Admin;
