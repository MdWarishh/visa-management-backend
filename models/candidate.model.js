import mongoose from 'mongoose';

// ── Status History sub-document ───────────────────────────────────
const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['Pending', 'Under Review', 'Approved', 'Rejected', 'Issued'],
      required: true,
    },
    changedBy: { type: String, default: 'Admin' },  // FIX: kon ne change kiya
    remarks: { type: String, default: '' },
  },
  { timestamps: true }  // changedAt automatically
);

// ── Main Candidate Schema ─────────────────────────────────────────
const candidateSchema = new mongoose.Schema(
  {
    // ── Personal Details ────────────────────────────────────────
    fullName:       { type: String, required: [true, 'Full name required'], trim: true },

    passportNumber: {
      type: String,
      required: [true, 'Passport number required'],
      unique: true,
      uppercase: true,
      trim: true,
    },

    // FIX: 'dob' se 'dateOfBirth' — consistent naming
    dateOfBirth:    { type: Date, required: [true, 'Date of birth required'] },

    gender: {
      type: String,
      required: [true, 'Gender required'],
      enum: ['Male', 'Female', 'Other'],
    },

    nationality:    { type: String, required: [true, 'Nationality required'], trim: true },
    phone:          { type: String, required: [true, 'Phone required'], trim: true },

    // FIX: email optional hai requirement ke hisab se
    email:          { type: String, default: '', lowercase: true, trim: true },

    // ── Application Details ──────────────────────────────────────
    applicationNumber: {
      type: String,
      required: [true, 'Application number required'],
      unique: true,
      uppercase: true,
      trim: true,
    },

    visaType: {
      type: String,
      required: [true, 'Visa type required'],
      enum: ['Tourist', 'Work', 'Student', 'Business', 'Transit', 'Medical', 'Family', 'Other'],
    },

    country:      { type: String, required: [true, 'Country required'], trim: true },
    sponsorName:  { type: String, default: '', trim: true },
    companyName:  { type: String, default: '', trim: true },
    duration:     { type: String, default: '', trim: true },

    entryType: {
      type: String,
      enum: ['Single', 'Double', 'Multiple'],
      default: 'Single',
    },

    applicationDate: { type: Date, default: Date.now },

    status: {
      type: String,
      enum: ['Pending', 'Under Review', 'Approved', 'Rejected', 'Issued'],
      default: 'Pending',
    },

    remarks: { type: String, default: '', trim: true },

    // ── Documents (FIX: 3 alag fields instead of single array) ──
    passportCopy:         { type: String, default: null },   // single file path
    photo:                { type: String, default: null },   // single file path
    supportingDocuments:  [{ type: String }],                // multiple files

    // ── Visa Issuance Fields ─────────────────────────────────────
    visaNumber: {
      type: String,
      unique: true,
      sparse: true,          // null values pe unique apply nahi hoga
      default: null,
    },
    // FIX: issueDate field add kiya — PDF mein zaroori hai
    issueDate:    { type: Date, default: null },
    finalVisaPdf: { type: String, default: null },

    // ── Status History ───────────────────────────────────────────
    statusHistory: [statusHistorySchema],

    // ── Soft Delete ──────────────────────────────────────────────
    isDeleted:  { type: Boolean, default: false },
    deletedAt:  { type: Date, default: null },   // FIX: kab delete hua

    // ── Download Logs (Phase 2) ──────────────────────────────────
    // FIX: requirement mein tha — add kiya
    downloadLogs: [
      {
        downloadedAt: { type: Date, default: Date.now },
        ip:           { type: String },
      },
    ],
  },
  {
    timestamps: true,  // createdAt, updatedAt auto
  }
);

// ── Indexes for fast queries ──────────────────────────────────────
candidateSchema.index({ passportNumber: 1 });
candidateSchema.index({ applicationNumber: 1 });
candidateSchema.index({ status: 1, isDeleted: 1 });
candidateSchema.index({ isDeleted: 1, createdAt: -1 });
candidateSchema.index({ dateOfBirth: 1 });  // Public tracking ke liye

// ── Static: Generate unique visa number ──────────────────────────
candidateSchema.statics.generateVisaNumber = function () {
  const year  = new Date().getFullYear();
  const rand  = Math.floor(10000000 + Math.random() * 90000000);
  return `VN${year}${rand}`;
};

const Candidate = mongoose.model('Candidate', candidateSchema);
export default Candidate;
