import mongoose from 'mongoose';

const statusHistorySchema = new mongoose.Schema({
  status:    { type: String },
  changedBy: { type: String, default: 'Admin' },
  note:      { type: String, default: '' },
}, { timestamps: true });

const candidateSchema = new mongoose.Schema({

  // DATA ISOLATION
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // EXACT FIELDS FROM SCREENSHOT
  passportNumber:  { type: String, required: true, uppercase: true, trim: true },
  visaNumber:      { type: String, default: '', trim: true },
  fullName:        { type: String, required: true, trim: true },
  dateOfBirth:     { type: Date,   required: true },
  profession:      { type: String, default: '', trim: true },
  companyName:     { type: String, default: '', trim: true },
  visaIssueDate:   { type: Date,   default: null },
  visaExpiryDate:  { type: Date,   default: null },
  visaType:        { type: String, default: '', trim: true },
  country:         { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['Pending', 'Under Review', 'Approved', 'Rejected', 'Issued'],
    default: 'Pending',
  },
  message: { type: String, default: '', trim: true },

  // Application tracking
  applicationNumber: { type: String, required: true, uppercase: true, trim: true },
  applicationDate:   { type: Date, default: Date.now },

  // Applicant photo
  photo: { type: String, default: null },

  // Generated PDF
  finalVisaPdf: { type: String, default: null },

  // History & logs
  statusHistory: [statusHistorySchema],
  downloadLogs:  [{ downloadedAt: { type: Date, default: Date.now }, ip: String }],

  // Soft Delete
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },

}, { timestamps: true });

candidateSchema.index({ adminId: 1, isDeleted: 1 });
candidateSchema.index({ adminId: 1, status: 1 });
candidateSchema.index({ adminId: 1, passportNumber: 1 }, { unique: true });
candidateSchema.index({ adminId: 1, applicationNumber: 1 }, { unique: true });

const Candidate = mongoose.model('Candidate', candidateSchema);
export default Candidate;
