/**
 * RoadFix — User Management Routes (Super Admin only)
 *
 * GET    /api/users           — List all users (with filters)
 * GET    /api/users/:id       — Get user by ID
 * PATCH  /api/users/:id/role  — Update user role
 * PATCH  /api/users/:id/deactivate — Deactivate account
 * GET    /api/users/officers  — List all officers (for zone managers)
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getCollection } = require('../db/mongoClient');
const { appendAuditLog } = require('../db/auditDatabase');
const { authenticateToken, checkRole } = require('../middleware/auth');
const logger = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');

const sanitizeUser = (user) => {
    const { password, _id, ...safe } = user;
    return safe;
};

// GET /api/users/officers — zone managers + admins can see officers
router.get('/officers', authenticateToken, checkRole('zone_manager', 'admin', 'super_admin'), async (req, res, next) => {
    try {
        const users = await getCollection('users');
        const { zone } = req.query;

        const filter = {
            role: 'municipal_officer',
            isDeactivated: { $ne: true }
        };
        if (zone) filter.zone = zone;

        const officers = await users.find(filter, {
            projection: { password: 0, _id: 0 }
        }).sort({ name: 1 }).toArray();

        res.json({ success: true, data: officers });
    } catch (err) {
        next(err);
    }
});

// GET /api/users — super_admin gets all users
router.get('/', authenticateToken, checkRole('super_admin', 'admin'), async (req, res, next) => {
    try {
        const users = await getCollection('users');
        const { role, zone, page = 1, limit = 50 } = req.query;

        const filter = {};
        if (role) filter.role = role;
        if (zone) filter.zone = zone;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, parseInt(limit));
        const skip = (pageNum - 1) * limitNum;

        const [rows, total] = await Promise.all([
            users.find(filter, { projection: { password: 0 } })
                .sort({ createdAt: -1 }).skip(skip).limit(limitNum).toArray(),
            users.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: rows,
            pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/users/:id
router.get('/:id', authenticateToken, checkRole('super_admin', 'admin', 'zone_manager'), async (req, res, next) => {
    try {
        const users = await getCollection('users');
        const user = await users.findOne({ id: req.params.id }, { projection: { password: 0 } });
        if (!user) return next(new AppError('User not found', 404));
        res.json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
});

// POST /api/users — create officer/zone_manager (super_admin only)
router.post('/', authenticateToken, checkRole('super_admin', 'admin'), [
    body('name').trim().isLength({ min: 2 }).withMessage('Name required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('role').isIn(['municipal_officer', 'zone_manager', 'citizen']).withMessage('Invalid role'),
    body('password').isLength({ min: 8 }).withMessage('Password min 8 chars')
], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

    try {
        const users = await getCollection('users');
        const { name, email, password, role, ward, zone, phone } = req.body;
        const normalizedEmail = email.toLowerCase().trim();

        const existing = await users.findOne({ email: normalizedEmail });
        if (existing) return next(new AppError('Email already in use', 409));

        const hash = await bcrypt.hash(password, 12);
        const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const now = new Date().toISOString();

        const newUser = {
            id: userId, name: name.trim(), email: normalizedEmail, password: hash,
            role, phone: phone || null, ward: ward || null, zone: zone || null,
            points: 0, level: 'Bronze', isDeactivated: false, createdAt: now, lastLoginAt: null
        };

        await users.insertOne(newUser);
        await appendAuditLog({
            action: 'user.created',
            actor: { id: req.user.id, name: req.user.name, role: req.user.role },
            details: `Created ${role} account: ${normalizedEmail}`
        });

        logger.info(`User created: ${normalizedEmail} (${role}) by ${req.user.email}`);
        res.status(201).json({ success: true, data: sanitizeUser(newUser) });
    } catch (err) {
        next(err);
    }
});

// PATCH /api/users/:id/role
router.patch('/:id/role', authenticateToken, checkRole('super_admin'), [
    body('role').isIn(['citizen', 'municipal_officer', 'zone_manager', 'super_admin', 'admin']).withMessage('Invalid role')
], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

    try {
        const users = await getCollection('users');
        const { role, ward, zone } = req.body;
        const target = await users.findOne({ id: req.params.id });
        if (!target) return next(new AppError('User not found', 404));

        const updateFields = { role, updatedAt: new Date().toISOString() };
        if (ward !== undefined) updateFields.ward = ward;
        if (zone !== undefined) updateFields.zone = zone;

        await users.updateOne({ id: req.params.id }, { $set: updateFields });
        await appendAuditLog({
            action: 'user.role_changed',
            actor: { id: req.user.id, name: req.user.name, role: req.user.role },
            details: `Changed ${target.email} role: ${target.role} → ${role}`
        });

        res.json({ success: true, message: `Role updated to ${role}` });
    } catch (err) {
        next(err);
    }
});

// PATCH /api/users/:id/deactivate
router.patch('/:id/deactivate', authenticateToken, checkRole('super_admin', 'admin'), async (req, res, next) => {
    try {
        const users = await getCollection('users');
        const { deactivate } = req.body; // true or false
        const target = await users.findOne({ id: req.params.id });
        if (!target) return next(new AppError('User not found', 404));

        await users.updateOne({ id: req.params.id }, {
            $set: { isDeactivated: !!deactivate, updatedAt: new Date().toISOString() }
        });
        await appendAuditLog({
            action: deactivate ? 'user.deactivated' : 'user.activated',
            actor: { id: req.user.id, name: req.user.name, role: req.user.role },
            details: `${deactivate ? 'Deactivated' : 'Activated'} account: ${target.email}`
        });

        res.json({ success: true, message: `Account ${deactivate ? 'deactivated' : 'activated'}` });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
