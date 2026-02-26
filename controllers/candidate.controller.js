import Candidate from '../models/candidate.model.js';
import { generatePdf } from '../utils/pdfGenerator.js';
import logger from '../utils/logger.js';
import XLSX from 'xlsx';
import { existsSync } from 'fs';

// ── GET /api/candidates/stats ─────────────────────────────────────
// Dashboard ke liye statistics
export const getStats = async (req, res, next) => {
  try {
    const now          = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, issued, pending, rejected, underReview, approved, deletedCount, thisMonth] =
      await Promise.all([
        Candidate.countDocuments({ isDeleted: false }),
        Candidate.countDocuments({ isDeleted: false, status: 'Issued' }),
        Candidate.countDocuments({ isDeleted: false, status: 'Pending' }),
        Candidate.countDocuments({ isDeleted: false, status: 'Rejected' }),
        Candidate.countDocuments({ isDeleted: false, status: 'Under Review' }),
        Candidate.countDocuments({ isDeleted: false, status: 'Approved' }),
        Candidate.countDocuments({ isDeleted: true }),
        Candidate.countDocuments({ isDeleted: false, createdAt: { $gte: startOfMonth } }),
      ]);

    res.json({
      success: true,
      stats: { total, issued, pending, rejected, underReview, approved, deletedCount, thisMonth },
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/candidates ───────────────────────────────────────────
// Pagination + Search + Filter
export const getAll = async (req, res, next) => {
  try {
    const {
      page        = 1,
      limit       = 15,
      search      = '',
      status      = '',
      visaType    = '',
      showDeleted = 'false',
      sortBy      = 'createdAt',
      sortOrder   = 'desc',
    } = req.query;

    // Base query
    const query = { isDeleted: showDeleted === 'true' };

    // Search across multiple fields
    if (search.trim()) {
      query.$or = [
        { fullName:          { $regex: search.trim(), $options: 'i' } },
        { passportNumber:    { $regex: search.trim(), $options: 'i' } },
        { applicationNumber: { $regex: search.trim(), $options: 'i' } },
        { nationality:       { $regex: search.trim(), $options: 'i' } },
        { country:           { $regex: search.trim(), $options: 'i' } },
      ];
    }

    if (status)   query.status   = status;
    if (visaType) query.visaType = visaType;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [candidates, total] = await Promise.all([
      Candidate.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .select('-downloadLogs')   // Heavy field exclude karo list mein
        .lean(),
      Candidate.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: candidates,
      pagination: {
        current: parseInt(page),
        limit:   parseInt(limit),
        total,
        pages:   Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/candidates/:id ───────────────────────────────────────
// Single candidate — edit page ke liye
export const getOne = async (req, res, next) => {
  try {
    const candidate = await Candidate.findById(req.params.id);

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found.' });
    }

    res.json({ success: true, data: candidate });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/candidates ──────────────────────────────────────────
export const addCandidate = async (req, res, next) => {
  try {
    const {
      fullName, passportNumber, dateOfBirth, gender, nationality, phone, email,
      applicationNumber, visaType, country, sponsorName, companyName, duration,
      entryType, applicationDate, status, remarks,
    } = req.body;

    // Required fields check
    if (!fullName || !passportNumber || !dateOfBirth || !gender || !nationality || !phone) {
      return res.status(400).json({ success: false, message: 'Personal details incomplete.' });
    }

    if (!applicationNumber || !visaType || !country) {
      return res.status(400).json({ success: false, message: 'Application details incomplete.' });
    }

    // Unique passport check
    const existingPassport = await Candidate.findOne({
      passportNumber: passportNumber.toUpperCase().trim(),
    });
    if (existingPassport) {
      return res.status(409).json({
        success: false,
        message: `Passport number "${passportNumber}" already exists.`,
      });
    }

    // Unique application number check
    const existingApp = await Candidate.findOne({
      applicationNumber: applicationNumber.toUpperCase().trim(),
    });
    if (existingApp) {
      return res.status(409).json({
        success: false,
        message: `Application number "${applicationNumber}" already exists.`,
      });
    }

    // Files from multer (alag alag fields)
    const files   = req.files || {};
    const passportCopy        = files.passportCopy?.[0]?.path || null;
    const photo               = files.photo?.[0]?.path        || null;
    const supportingDocuments = files.supportingDocuments?.map((f) => f.path) || [];

    const initialStatus = status || 'Pending';

    const candidate = await Candidate.create({
      fullName:          fullName.trim(),
      passportNumber:    passportNumber.toUpperCase().trim(),
      dateOfBirth,
      gender,
      nationality:       nationality.trim(),
      phone:             phone.trim(),
      email:             email?.trim().toLowerCase() || '',
      applicationNumber: applicationNumber.toUpperCase().trim(),
      visaType,
      country:           country.trim(),
      sponsorName:       sponsorName?.trim()    || '',
      companyName:       companyName?.trim()    || '',
      duration:          duration?.trim()       || '',
      entryType:         entryType              || 'Single',
      applicationDate:   applicationDate        || new Date(),
      status:            initialStatus,
      remarks:           remarks?.trim()        || '',
      passportCopy,
      photo,
      supportingDocuments,
      statusHistory: [{
        status:    initialStatus,
        changedBy: req.admin?.email || 'Admin',
      }],
    });

    logger.info('Candidate added', {
      applicationNumber: candidate.applicationNumber,
      by: req.admin?.email,
    });

    res.status(201).json({
      success: true,
      message: 'Candidate added successfully.',
      data: candidate,
    });
  } catch (error) {
    next(error);
  }
};

// ── PUT /api/candidates/:id ───────────────────────────────────────
export const editCandidate = async (req, res, next) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found.' });
    }

    const {
      fullName, dateOfBirth, gender, nationality, phone, email,
      visaType, country, sponsorName, companyName, duration,
      entryType, applicationDate, status, remarks,
    } = req.body;

    // Status change track karo
    const statusChanged = status && status !== candidate.status;

    // Fields update karo (sirf jo bheje gaye hain)
    if (fullName)            candidate.fullName          = fullName.trim();
    if (dateOfBirth)         candidate.dateOfBirth        = dateOfBirth;
    if (gender)              candidate.gender             = gender;
    if (nationality)         candidate.nationality        = nationality.trim();
    if (phone)               candidate.phone              = phone.trim();
    if (email !== undefined) candidate.email              = email.trim().toLowerCase();
    if (visaType)            candidate.visaType           = visaType;
    if (country)             candidate.country            = country.trim();
    if (sponsorName !== undefined) candidate.sponsorName  = sponsorName.trim();
    if (companyName !== undefined) candidate.companyName  = companyName.trim();
    if (duration !== undefined)    candidate.duration     = duration.trim();
    if (entryType)           candidate.entryType          = entryType;
    if (applicationDate)     candidate.applicationDate    = applicationDate;
    if (remarks !== undefined)     candidate.remarks      = remarks.trim();

    // Status change
    if (statusChanged) {
      candidate.status = status;
      candidate.statusHistory.push({
        status,
        changedBy: req.admin?.email || 'Admin',
        remarks:   remarks || '',
      });
    }

    // Files update
    const files = req.files || {};
    if (files.passportCopy?.[0])   candidate.passportCopy  = files.passportCopy[0].path;
    if (files.photo?.[0])          candidate.photo         = files.photo[0].path;
    if (files.supportingDocuments?.length) {
      candidate.supportingDocuments.push(...files.supportingDocuments.map((f) => f.path));
    }

    // ── Auto PDF generation jab status = 'Issued' ────────────────
    if (statusChanged && status === 'Issued') {
      // Unique visa number generate karo
      if (!candidate.visaNumber) {
        let visaNumber;
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 10) {
          visaNumber = Candidate.generateVisaNumber();
          const existing = await Candidate.findOne({ visaNumber });
          if (!existing) isUnique = true;
          attempts++;
        }

        candidate.visaNumber = visaNumber;
        candidate.issueDate  = new Date();
      }

      // Pehle save karo (PDF mein visaNumber chahiye)
      await candidate.save();

      // PDF generate karo
      try {
        const pdfPath = await generatePdf(candidate);
        // FIX: PDF path save karo — ye missing tha
        candidate.finalVisaPdf = pdfPath;
        await candidate.save();
      } catch (pdfErr) {
        logger.error('PDF generation failed', {
          applicationNumber: candidate.applicationNumber,
          error: pdfErr.message,
        });
        // PDF fail hone se update fail nahi hogi
      }
    } else {
      await candidate.save();
    }

    logger.info('Candidate updated', {
      id: candidate._id,
      applicationNumber: candidate.applicationNumber,
      statusChanged,
      newStatus: status,
      by: req.admin?.email,
    });

    // Fresh data return karo
    const updated = await Candidate.findById(candidate._id);
    res.json({
      success: true,
      message: 'Candidate updated successfully.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// ── DELETE /api/candidates/:id (Soft Delete) ──────────────────────
export const softDelete = async (req, res, next) => {
  try {
    const candidate = await Candidate.findById(req.params.id);

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found.' });
    }

    if (candidate.isDeleted) {
      return res.status(400).json({ success: false, message: 'Already deleted.' });
    }

    candidate.isDeleted = true;
    candidate.deletedAt = new Date();
    await candidate.save();

    logger.info('Candidate soft deleted', {
      id: candidate._id,
      applicationNumber: candidate.applicationNumber,
      by: req.admin?.email,
    });

    res.json({ success: true, message: 'Candidate deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/candidates/export/excel ─────────────────────────────
// FIX: Complete with all columns
export const exportExcel = async (req, res, next) => {
  try {
    const candidates = await Candidate.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .lean();

    // All columns
    const rows = candidates.map((c, i) => ({
      'Sr#':                i + 1,
      'Application No':     c.applicationNumber,
      'Full Name':          c.fullName,
      'Passport No':        c.passportNumber,
      'Date of Birth':      c.dateOfBirth ? new Date(c.dateOfBirth).toLocaleDateString('en-GB') : '',
      'Gender':             c.gender,
      'Nationality':        c.nationality,
      'Phone':              c.phone,
      'Email':              c.email || '',
      'Visa Type':          c.visaType,
      'Country':            c.country,
      'Sponsor Name':       c.sponsorName || '',
      'Company Name':       c.companyName || '',
      'Duration':           c.duration || '',
      'Entry Type':         c.entryType,
      'Application Date':   c.applicationDate ? new Date(c.applicationDate).toLocaleDateString('en-GB') : '',
      'Status':             c.status,
      'Visa Number':        c.visaNumber || '',
      'Issue Date':         c.issueDate ? new Date(c.issueDate).toLocaleDateString('en-GB') : '',
      'Remarks':            c.remarks || '',
      'Created At':         new Date(c.createdAt).toLocaleDateString('en-GB'),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws['!cols'] = [
      { wch: 5 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 15 },
      { wch: 8 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 12 },
      { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 10 },
      { wch: 15 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 20 },
      { wch: 12 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Candidates');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader(
      'Content-Disposition',
      `attachment; filename=candidates-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    res.send(buffer);

    logger.info('Excel exported', { count: candidates.length, by: req.admin?.email });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/candidates/download/:id ─────────────────────────────
// Admin: direct download
// Public (Phase 2): credential verification ke baad
export const downloadVisa = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { applicationNumber, passportNumber, dateOfBirth } = req.query;

    let candidate;

    if (req.admin) {
      // Admin: sirf ID se find karo
      candidate = await Candidate.findById(id);
    } else {
      // Public: credentials verify karo
      if (!dateOfBirth || (!applicationNumber && !passportNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Verification credentials required.',
        });
      }

      const dob      = new Date(dateOfBirth);
      const dobStart = new Date(dob.setHours(0, 0, 0, 0));
      const dobEnd   = new Date(dob.setHours(23, 59, 59, 999));

      candidate = await Candidate.findOne({
        _id: id,
        $or: [
          ...(applicationNumber ? [{ applicationNumber: applicationNumber.toUpperCase() }] : []),
          ...(passportNumber    ? [{ passportNumber:    passportNumber.toUpperCase()    }] : []),
        ],
        dateOfBirth: { $gte: dobStart, $lte: dobEnd },
        isDeleted: false,
        status: 'Issued',
      });
    }

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found.' });
    }

    if (candidate.status !== 'Issued') {
      return res.status(403).json({ success: false, message: 'Visa not yet issued.' });
    }

    if (!candidate.finalVisaPdf || !existsSync(candidate.finalVisaPdf)) {
      return res.status(404).json({ success: false, message: 'PDF not found. Contact admin.' });
    }

    // Log the download
    candidate.downloadLogs.push({ ip: req.ip || 'unknown' });
    await candidate.save();

    logger.info('Visa PDF downloaded', {
      applicationNumber: candidate.applicationNumber,
      ip: req.ip,
      by: req.admin?.email || 'public',
    });

    res.download(candidate.finalVisaPdf, `Visa-${candidate.applicationNumber}.pdf`);
  } catch (error) {
    next(error);
  }
};

// ── POST /api/candidates/track (Public) ──────────────────────────
// Phase 2: Public tracking
export const trackVisa = async (req, res, next) => {
  try {
    const { applicationNumber, passportNumber, dateOfBirth } = req.body;

    if (!dateOfBirth) {
      return res.status(400).json({ success: false, message: 'Date of birth required.' });
    }

    if (!applicationNumber && !passportNumber) {
      return res.status(400).json({
        success: false,
        message: 'Application number ya passport number required hai.',
      });
    }

    const orConditions = [];
    if (applicationNumber?.trim()) {
      orConditions.push({ applicationNumber: applicationNumber.toUpperCase().trim() });
    }
    if (passportNumber?.trim()) {
      orConditions.push({ passportNumber: passportNumber.toUpperCase().trim() });
    }

    const dob      = new Date(dateOfBirth);
    const dobStart = new Date(new Date(dob).setHours(0, 0, 0, 0));
    const dobEnd   = new Date(new Date(dob).setHours(23, 59, 59, 999));

    const candidate = await Candidate.findOne({
      $or: orConditions,
      dateOfBirth: { $gte: dobStart, $lte: dobEnd },
      isDeleted: false,
    });

    // IMPORTANT: Generic error — kon sa field galat tha nahi batana
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'No record found. Please check your information.',
      });
    }

    // Limited data return karo — sensitive info hide karo
    res.json({
      success: true,
      data: {
        fullName:        candidate.fullName,
        visaType:        candidate.visaType,
        country:         candidate.country,
        status:          candidate.status,
        applicationDate: candidate.applicationDate,
        issueDate:       candidate.issueDate || null,
        canDownload:     candidate.status === 'Issued' && !!candidate.finalVisaPdf,
        candidateId:     candidate._id,
      },
    });
  } catch (error) {
    next(error);
  }
};
