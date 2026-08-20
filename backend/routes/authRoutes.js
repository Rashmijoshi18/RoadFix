/**
 * RoadFix — Auth Routes (JWT + httpOnly Cookies)
 *
 * POST /api/auth/login         — Login with email/password → issues JWT cookies
 * POST /api/auth/register      — Register new citizen account
 * POST /api/auth/logout        — Clear JWT cookies
 * POST /api/auth/refresh       — Silently refresh access token
 * GET  /api/auth/me            — Get current user profile (requires auth)
 * PATCH /api/auth/me           — Update profile (name, phone)
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');

const { getCollection } = require('../db/mongoClient');
const { appendAuditLog } = require('../db/auditDatabase');
const {
    signAccessToken,
    signRefreshToken,
    setAuthCookies,
    clearAuthCookies,
    authenticateToken,
    REFRESH_SECRET
} = require('../middleware/auth');
const logger = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');

const jwt = require('jsonwebtoken');

// ─── Validation chains ────────────────────────────────────────────────────────
const loginValidation = [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
];

const registerValidation = [
    body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name must be 2–80 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password')
        .isLength({ min: 8 })
        .matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d])/)
        .withMessage('Password must be at least 8 characters and include letters, numbers, and a special character')
];

// Helper — strip sensitive fields before sending to client
const sanitizeUser = (user) => {
    const { password, _id, refreshTokenHash, ...safe } = user;
    return safe;
};

// Helper — build JWT payload from user document
const buildPayload = (user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    ward: user.ward || null,
    zone: user.zone || null
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', loginValidation, async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { email, password } = req.body;

    try {
        const users = await getCollection('users');
        const user = await users.findOne({ email: email.toLowerCase().trim() });

        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid email or password.' });
        }

        if (user.isDeactivated) {
            return res.status(403).json({ success: false, error: 'This account has been deactivated. Please contact an administrator.' });
        }

        const storedPassword = user.password || '';
        const isHashed = storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$');
        let isValid = false;

        if (isHashed) {
            isValid = await bcrypt.compare(password, storedPassword);
        } else {
            // Backward compat: migrate plaintext password to hashed
            isValid = password === storedPassword;
            if (isValid) {
                const hash = await bcrypt.hash(password, 12);
                await users.updateOne({ _id: user._id }, { $set: { password: hash } });
            }
        }

        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Invalid email or password.' });
        }

        const payload = buildPayload(user);
        const accessToken = signAccessToken(payload);
        const refreshToken = signRefreshToken(payload);

        setAuthCookies(res, accessToken, refreshToken);

        // Update last login timestamp
        await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date().toISOString() } });

        await appendAuditLog({
            action: 'user.login',
            actor: { id: user.id, name: user.name, role: user.role },
            details: `User ${user.name} logged in successfully`
        });

        logger.info(`Login: ${user.email} (${user.role})`);

        return res.json({
            success: true,
            data: { user: sanitizeUser(user) },
            message: 'Logged in successfully'
        });
    } catch (err) {
        next(err);
    }
});

// ─── POST /api/auth/register ─────────────────────────────────────────────────
router.post('/register', registerValidation, async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { name, email, password, phone } = req.body;

    try {
        const users = await getCollection('users');
        const normalizedEmail = email.toLowerCase().trim();
        const existing = await users.findOne({ email: normalizedEmail });

        if (existing) {
            return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        const newUser = {
            id: userId,
            name: name.trim(),
            email: normalizedEmail,
            password: passwordHash,
            role: 'citizen',
            phone: phone || null,
            ward: null,
            zone: null,
            points: 0,
            level: 'Bronze',
            isDeactivated: false,
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString()
        };

        await users.insertOne(newUser);

        const payload = buildPayload(newUser);
        const accessToken = signAccessToken(payload);
        const refreshToken = signRefreshToken(payload);

        setAuthCookies(res, accessToken, refreshToken);

        await appendAuditLog({
            action: 'user.registered',
            actor: { id: userId, name: name.trim(), role: 'citizen' },
            details: `New citizen account registered: ${normalizedEmail}`
        });

        logger.info(`Register: new citizen ${normalizedEmail}`);

        return res.status(201).json({
            success: true,
            data: { user: sanitizeUser(newUser) },
            message: 'Account created successfully'
        });
    } catch (err) {
        next(err);
    }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', authenticateToken, async (req, res, next) => {
    try {
        clearAuthCookies(res);

        await appendAuditLog({
            action: 'user.logout',
            actor: { id: req.user.id, name: req.user.name, role: req.user.role },
            details: `User ${req.user.name} logged out`
        });

        logger.info(`Logout: ${req.user.email}`);
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
        next(err);
    }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post('/refresh', (req, res, next) => {
    const refreshToken = req.cookies?.rf_refresh;

    if (!refreshToken) {
        return res.status(401).json({ success: false, error: 'No refresh token found. Please log in.' });
    }

    try {
        const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
        const payload = {
            id: decoded.id,
            email: decoded.email,
            name: decoded.name,
            role: decoded.role,
            ward: decoded.ward,
            zone: decoded.zone
        };

        const newAccessToken = signAccessToken(payload);
        const newRefreshToken = signRefreshToken(payload);
        setAuthCookies(res, newAccessToken, newRefreshToken);

        logger.info(`Token refreshed for: ${payload.email}`);
        res.json({ success: true, message: 'Token refreshed' });
    } catch (err) {
        clearAuthCookies(res);
        return res.status(401).json({ success: false, error: 'Refresh token expired. Please log in again.' });
    }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res, next) => {
    try {
        const users = await getCollection('users');
        const user = await users.findOne({ id: req.user.id });

        if (!user) {
            clearAuthCookies(res);
            return res.status(404).json({ success: false, error: 'User account not found.' });
        }

        return res.json({ success: true, data: { user: sanitizeUser(user) } });
    } catch (err) {
        next(err);
    }
});

// ─── PATCH /api/auth/me ───────────────────────────────────────────────────────
router.patch('/me', authenticateToken, [
    body('name').optional().trim().isLength({ min: 2, max: 80 }).withMessage('Name must be 2–80 characters'),
    body('phone').optional().isMobilePhone().withMessage('Invalid phone number')
], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    try {
        const users = await getCollection('users');
        const { name, phone } = req.body;
        const updateFields = {};
        if (name) updateFields.name = name.trim();
        if (phone !== undefined) updateFields.phone = phone;
        updateFields.updatedAt = new Date().toISOString();

        await users.updateOne({ id: req.user.id }, { $set: updateFields });
        const updated = await users.findOne({ id: req.user.id });

        return res.json({ success: true, data: { user: sanitizeUser(updated) } });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
