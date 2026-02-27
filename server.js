import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from './utils/logger.js';
const __dirname = dirname(fileURLToPath(import.meta.url));

import authRoutes        from './routes/auth.routes.js';
import superAdminRoutes  from './routes/superAdmin.routes.js';
import userRoutes        from './routes/user.routes.js';
import candidateRoutes   from './routes/candidate.routes.js';

const app = express();

// ── Security ──────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc:     ["'self'", "data:"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
    },
  },
}));
app.disable('x-powered-by');

// ── CORS ──────────────────────────────────────────────
const allowed = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin && process.env.NODE_ENV === 'development') return cb(null, true);
    if (allowed.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// ── Rate limit ────────────────────────────────────────
app.use(rateLimit({ windowMs: 15*60*1000, max: 500, standardHeaders: true, legacyHeaders: false }));

// ── Parsers ───────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET));

if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// ── Block direct file access ──────────────────────────
// Photos — accessible (for admin panel preview)
app.use('/uploads/photos', express.static(join(__dirname, 'uploads/photos')));
// Visa docs served via API route (not directly)
app.use('/uploads', (req, res) => res.status(403).json({ message: 'Forbidden' }));
app.use('/generated-visas', (req, res) => res.status(403).json({ message: 'Forbidden' }));

// ── Health ────────────────────────────────────────────
app.get('/api/health', (req, res) =>
  res.json({ success: true, status: 'ok', env: process.env.NODE_ENV, time: new Date().toISOString() })
);

// ── Routes ────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/superadmin',    superAdminRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/candidates',    candidateRoutes);

// ── 404 ───────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ success: false, message: `Not found: ${req.method} ${req.originalUrl}` })
);

// ── Global Error Handler ──────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Global error', { message: err.message, path: req.originalUrl });

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ success: false, message: `Duplicate: ${field} already exists.` });
  }
  if (err.name === 'ValidationError') {
    const msgs = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ success: false, message: msgs.join(', ') });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File too large. Max 5MB.' });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ── Start ─────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    logger.info('MongoDB connected');
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n✅ Server: http://localhost:${PORT}`);
      console.log(`📊 Health: http://localhost:${PORT}/api/health`);
      console.log(`\n🔑 First time? Run this once (Postman):`);
      console.log(`   POST http://localhost:${PORT}/api/auth/seed-superadmin\n`);
    });
  })
  .catch(err => {
    logger.error('MongoDB failed', { error: err.message });
    process.exit(1);
  });
