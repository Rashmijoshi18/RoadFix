/**
 * RoadFix — Express Application
 * Production-ready configuration with security, logging, and rate limiting.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const logger = require('./middleware/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const auditRoutes = require('./routes/auditRoutes');
const reportRoutes = require('./routes/reportRoutes');
const contactRoutes = require('./routes/contactRoutes');
const userRoutes = require('./routes/userRoutes');
const zoneRoutes = require('./routes/zoneRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const rewardRoutes = require('./routes/rewardRoutes');
const aiRoutes = require('./routes/aiRoutes');

const app = express();

// ─── Upload directory ─────────────────────────────────────────────────────────
const uploadDir = process.env.VERCEL
    ? path.join('/tmp', 'roadfix-uploads')
    : path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
app.locals.uploadDir = uploadDir;

// ─── Security Headers (Helmet) ────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",       // needed for inline scripts in HTML pages
                'https://fonts.googleapis.com',
                'https://cdnjs.cloudflare.com',
                'https://unpkg.com',
                'https://cdn.jsdelivr.net'
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                'https://fonts.googleapis.com',
                'https://cdnjs.cloudflare.com',
                'https://unpkg.com',
                'https://cdn.jsdelivr.net'
            ],
            fontSrc: [
                "'self'",
                'https://fonts.gstatic.com',
                'https://cdnjs.cloudflare.com'
            ],
            imgSrc: [
                "'self'",
                'data:',
                'blob:',
                'https://*.openstreetmap.org',
                'https://*.tile.openstreetmap.org',
                'https://res.cloudinary.com',
                'https://unpkg.com'
            ],
            connectSrc: [
                "'self'",
                'wss:',
                'ws:',
                'https://generativelanguage.googleapis.com'
            ],
            workerSrc: ["'self'", 'blob:'],
            frameSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false // Required for Leaflet map tiles
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim());

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (server-to-server, curl, mobile apps)
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        callback(new Error(`CORS policy: Origin ${origin} not allowed`));
    },
    credentials: true, // Required for httpOnly cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// ─── HTTP Request Logging (Morgan → Winston) ──────────────────────────────────
const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat, {
    stream: { write: (message) => logger.http(message.trim()) }
}));

// ─── Body Parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(uploadDir));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many login attempts. Please try again in 15 minutes.' }
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Please slow down.' }
});

const aiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'AI analysis rate limit reached. Please wait a moment.' }
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/reports', apiLimiter, reportRoutes);
app.use('/api/contact', apiLimiter, contactRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/zones', apiLimiter, zoneRoutes);
app.use('/api/analytics', apiLimiter, analyticsRoutes);
app.use('/api/notifications', apiLimiter, notificationRoutes);
app.use('/api/rewards', apiLimiter, rewardRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);

// ─── Root Redirect ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.redirect('/index.html');
});

// ─── 404 + Error Handlers ─────────────────────────────────────────────────────
// Only apply 404 to /api/* to avoid interfering with static file serving
app.use('/api/*', notFoundHandler);
app.use(errorHandler);

module.exports = app;