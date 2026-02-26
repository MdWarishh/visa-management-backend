import Candidate from '../models/Candidate.js';
import { generatePdf } from '../utils/pdfGenerator.js';
import logger from '../utils/logger.js';
import XLSX from 'xlsx';
import { existsSync } from 'fs';
import path from 'path';

// Helper: build admin-scoped filter
const adminFilter = (req, extra = {}) => {
  const f = { isDeleted: false, ...extra };
  if (req.adminScope) f.adminId = req.adminScope;
  return f;
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '';

// GET /api/candidates/stats
export const getStats = async (req, res, next) => {
  try {
    const base = adminFilter(req);
    const now  = new Date();
    const som  = new Date(now.getFullYear(), now.getMonth(), 1);
    const [total, approved, rejected, pending, underReview, issued, deletedCount, thisMonth] =
      await Promise.all([
        Candidate.countDocuments(base),
        Candidate.countDocuments({ ...base, status: 'Approved' }),
        Candidate.countDocuments({ ...base, status: 'Rejected' }),
        Candidate.countDocuments({ ...base, status: 'Pending' }),
        Candidate.countDocuments({ ...base, status: 'Under Review' }),
        Candidate.countDocuments({ ...base, status: 'Issued' }),
        Candidate.countDocuments({ ...adminFilter(req, { isDeleted: true }) }),
        Candidate.countDocuments({ ...base, createdAt: { $gte: som } }),
      ]);
    res.json({ success: true, stats: { total, approved, rejected, pending, underReview, issued, deletedCount, thisMonth } });
  } catch (err) { next(err); }
};

// GET /api/candidates
export const getAll = async (req, res, next) => {
  try {
    const { page = 1, limit = 15, search = '', status = '' } = req.query;
    const query = adminFilter(req);

    if (search.trim()) {
      query.$or = [
        { fullName:          { $regex: search.trim(), $options: 'i' } },
        { passportNumber:    { $regex: search.trim(), $options: 'i' } },
        { applicationNumber: { $regex: search.trim(), $options: 'i' } },
        { visaNumber:        { $regex: search.trim(), $options: 'i' } },
      ];
    }
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      Candidate.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).select('-downloadLogs').lean(),
      Candidate.countDocuments(query),
    ]);
    res.json({ success: true, data, pagination: { current: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { next(err); }
};

// GET /api/candidates/:id
export const getOne = async (req, res, next) => {
  try {
    const query = { _id: req.params.id, isDeleted: false };
    if (req.adminScope) query.adminId = req.adminScope;
    const c = await Candidate.findOne(query);
    if (!c) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, data: c });
  } catch (err) { next(err); }
};

// POST /api/candidates
export const addCandidate = async (req, res, next) => {
  try {
    const {
      passportNumber, visaNumber, fullName, dateOfBirth,
      profession, companyName, visaIssueDate, visaExpiryDate,
      visaType, country, status, message, applicationNumber, applicationDate,
    } = req.body;

    if (!fullName || !passportNumber || !dateOfBirth || !country || !applicationNumber) {
      return res.status(400).json({ success: false, message: 'Required fields missing.' });
    }

    const adminId = req.user.role === 'user' ? req.user.createdBy : req.user._id;

    // Duplicate check
    const [dupPass, dupApp] = await Promise.all([
      Candidate.findOne({ adminId, passportNumber: passportNumber.toUpperCase().trim() }),
      Candidate.findOne({ adminId, applicationNumber: applicationNumber.toUpperCase().trim() }),
    ]);
    if (dupPass) return res.status(409).json({ success: false, message: `Passport "${passportNumber}" already exists.` });
    if (dupApp)  return res.status(409).json({ success: false, message: `Application "${applicationNumber}" already exists.` });

    const initStatus = status || 'Pending';
    const photoPath = req.files?.photo?.[0]?.path || null;

    const candidate = await Candidate.create({
      adminId,
      passportNumber:  passportNumber.toUpperCase().trim(),
      visaNumber:      visaNumber?.trim()     || '',
      fullName:        fullName.trim(),
      dateOfBirth,
      profession:      profession?.trim()     || '',
      companyName:     companyName?.trim()    || '',
      visaIssueDate:   visaIssueDate          || null,
      visaExpiryDate:  visaExpiryDate         || null,
      visaType:        visaType?.trim()       || '',
      country:         country.trim(),
      status:          initStatus,
      message:         message?.trim()        || '',
      applicationNumber: applicationNumber.toUpperCase().trim(),
      applicationDate: applicationDate        || new Date(),
      photo:           photoPath,
      statusHistory:   [{ status: initStatus, changedBy: req.user.name || req.user.email }],
    });

    logger.info('Candidate added', { app: candidate.applicationNumber, by: req.user.email });
    res.status(201).json({ success: true, message: 'Candidate added.', data: candidate });
  } catch (err) { next(err); }
};

// PUT /api/candidates/:id
export const editCandidate = async (req, res, next) => {
  try {
    const query = { _id: req.params.id, isDeleted: false };
    if (req.adminScope) query.adminId = req.adminScope;

    const candidate = await Candidate.findOne(query);
    if (!candidate) return res.status(404).json({ success: false, message: 'Not found.' });

    const {
      passportNumber, visaNumber, fullName, dateOfBirth,
      profession, companyName, visaIssueDate, visaExpiryDate,
      visaType, country, status, message, applicationDate,
    } = req.body;

    const statusChanged = status && status !== candidate.status;

    if (fullName)          candidate.fullName       = fullName.trim();
    if (dateOfBirth)       candidate.dateOfBirth    = dateOfBirth;
    if (profession !== undefined) candidate.profession  = profession?.trim() || '';
    if (companyName !== undefined) candidate.companyName = companyName?.trim() || '';
    if (visaNumber  !== undefined) candidate.visaNumber  = visaNumber?.trim()  || '';
    if (visaIssueDate !== undefined) candidate.visaIssueDate = visaIssueDate || null;
    if (visaExpiryDate !== undefined) candidate.visaExpiryDate = visaExpiryDate || null;
    if (visaType !== undefined) candidate.visaType   = visaType?.trim() || '';
    if (country)           candidate.country        = country.trim();
    if (message !== undefined) candidate.message    = message?.trim() || '';
    if (applicationDate)   candidate.applicationDate = applicationDate;

    // Photo update
    if (req.files?.photo?.[0]) candidate.photo = req.files.photo[0].path;

    if (statusChanged) {
      candidate.status = status;
      candidate.statusHistory.push({ status, changedBy: req.user.name || req.user.email });
    }

    // Auto generate PDF when Approved or Issued
    if (statusChanged && (status === 'Approved' || status === 'Issued')) {
      await candidate.save();
      try {
        const pdfPath = await generatePdf(candidate);
        if (pdfPath) { candidate.finalVisaPdf = pdfPath; }
      } catch (e) { logger.error('PDF failed', { err: e.message }); }
    }

    await candidate.save();
    const updated = await Candidate.findById(candidate._id);
    logger.info('Candidate updated', { app: candidate.applicationNumber, status: candidate.status, by: req.user.email });
    res.json({ success: true, message: 'Updated.', data: updated });
  } catch (err) { next(err); }
};

// DELETE /api/candidates/:id
export const deleteCandidate = async (req, res, next) => {
  try {
    const query = { _id: req.params.id, isDeleted: false };
    if (req.adminScope) query.adminId = req.adminScope;
    const c = await Candidate.findOne(query);
    if (!c) return res.status(404).json({ success: false, message: 'Not found.' });
    c.isDeleted = true; c.deletedAt = new Date();
    await c.save();
    logger.info('Candidate deleted', { app: c.applicationNumber, by: req.user.email });
    res.json({ success: true, message: 'Deleted.' });
  } catch (err) { next(err); }
};

// GET /api/candidates/export/excel
export const exportExcel = async (req, res, next) => {
  try {
    const data = await Candidate.find(adminFilter(req)).sort({ createdAt: -1 }).lean();
    const rows = data.map((c, i) => ({
      'Sr#':              i + 1,
      'Application No':   c.applicationNumber,
      'Passport No':      c.passportNumber,
      'Visa No':          c.visaNumber || '',
      'Full Name':        c.fullName,
      'Date of Birth':    fmtDate(c.dateOfBirth),
      'Profession':       c.profession || '',
      'Company Name':     c.companyName || '',
      'Visa Issue Date':  fmtDate(c.visaIssueDate),
      'Visa Expiry Date': fmtDate(c.visaExpiryDate),
      'Visa Type':        c.visaType || '',
      'Country':          c.country,
      'Status':           c.status,
      'Message':          c.message || '',
      'Applied On':       fmtDate(c.applicationDate),
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [5,18,14,18,25,12,18,25,14,14,18,14,12,25,12].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename=visas-${new Date().toISOString().slice(0,10)}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) { next(err); }
};

// GET /api/candidates/admin/download/:id  (admin PDF download)
export const downloadVisa = async (req, res, next) => {
  try {
    const query = { _id: req.params.id, isDeleted: false };
    if (req.adminScope) query.adminId = req.adminScope;
    const c = await Candidate.findOne(query);
    if (!c) return res.status(404).json({ success: false, message: 'Not found.' });
    if (!c.finalVisaPdf || !existsSync(c.finalVisaPdf)) {
      // Try regenerating
      try {
        const p = await generatePdf(c);
        if (p) { c.finalVisaPdf = p; await c.save(); }
      } catch {}
    }
    if (!c.finalVisaPdf || !existsSync(c.finalVisaPdf)) {
      return res.status(404).json({ success: false, message: 'PDF not generated yet. Set status to Approved.' });
    }
    c.downloadLogs.push({ ip: req.ip }); await c.save();
    res.download(c.finalVisaPdf, `Visa-${c.applicationNumber}.pdf`);
  } catch (err) { next(err); }
};

// PUBLIC: POST /api/candidates/public/track
export const trackVisa = async (req, res, next) => {
  try {
    const { applicationNumber, passportNumber, dateOfBirth } = req.body;
    if (!dateOfBirth || (!applicationNumber && !passportNumber)) {
      return res.status(400).json({ success: false, message: 'DOB + application/passport number required.' });
    }
    const dob = new Date(dateOfBirth);
    const orConds = [];
    if (applicationNumber?.trim()) orConds.push({ applicationNumber: applicationNumber.toUpperCase().trim() });
    if (passportNumber?.trim())    orConds.push({ passportNumber:    passportNumber.toUpperCase().trim() });

    const c = await Candidate.findOne({
      $or: orConds,
      dateOfBirth: { $gte: new Date(new Date(dob).setHours(0,0,0,0)), $lte: new Date(new Date(dob).setHours(23,59,59,999)) },
      isDeleted: false,
    });

    if (!c) return res.status(404).json({ success: false, message: 'No record found. Check your details.' });

    res.json({
      success: true,
      data: {
        passportNumber:  c.passportNumber,
        visaNumber:      c.visaNumber,
        fullName:        c.fullName,
        dateOfBirth:     c.dateOfBirth,
        profession:      c.profession,
        companyName:     c.companyName,
        visaIssueDate:   c.visaIssueDate,
        visaExpiryDate:  c.visaExpiryDate,
        visaType:        c.visaType,
        country:         c.country,
        status:          c.status,
        message:         c.message,
        applicationNumber: c.applicationNumber,
        canDownload:     (c.status === 'Approved' || c.status === 'Issued') && !!c.finalVisaPdf,
        candidateId:     c._id,
      },
    });
  } catch (err) { next(err); }
};

// PUBLIC: GET /api/candidates/public/download/:id
export const publicDownload = async (req, res, next) => {
  try {
    const { applicationNumber, passportNumber, dateOfBirth } = req.query;
    if (!dateOfBirth || (!applicationNumber && !passportNumber)) {
      return res.status(400).json({ success: false, message: 'Verification required.' });
    }
    const dob = new Date(dateOfBirth);
    const orConds = [];
    if (applicationNumber?.trim()) orConds.push({ applicationNumber: applicationNumber.toUpperCase().trim() });
    if (passportNumber?.trim())    orConds.push({ passportNumber:    passportNumber.toUpperCase().trim() });

    const c = await Candidate.findOne({
      _id: req.params.id, $or: orConds,
      dateOfBirth: { $gte: new Date(new Date(dob).setHours(0,0,0,0)), $lte: new Date(new Date(dob).setHours(23,59,59,999)) },
      isDeleted: false,
    });

    if (!c || !c.finalVisaPdf || !existsSync(c.finalVisaPdf)) {
      return res.status(404).json({ success: false, message: 'Not eligible for download.' });
    }
    c.downloadLogs.push({ ip: req.ip }); await c.save();
    res.download(c.finalVisaPdf, `Visa-${c.applicationNumber}.pdf`);
  } catch (err) { next(err); }
};
