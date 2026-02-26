import winston from 'winston';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logsDir = join(__dirname, '../logs');
if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

const fmt = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    const m = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${stack ? '\n' + stack : ''}${m}`;
  })
);

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: fmt,
  transports: [
    new winston.transports.Console({ format: winston.format.combine(winston.format.colorize({ all: true }), fmt) }),
    new winston.transports.File({ filename: join(logsDir, 'error.log'), level: 'error', maxsize: 5*1024*1024, maxFiles: 5 }),
    new winston.transports.File({ filename: join(logsDir, 'combined.log'), maxsize: 10*1024*1024, maxFiles: 10 }),
  ],
});

export default logger;
