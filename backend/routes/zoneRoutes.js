/**
 * RoadFix — Zone & Ward Management Routes
 */

const express = require('express');
const router = express.Router();
const { getCollection } = require('../db/mongoClient');
const { authenticateToken, checkRole } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

// GET /api/zones — list all zones with ward info
router.get('/', authenticateToken, async (req, res, next) => {
    try {
        const zones = await getCollection('zones');
        const all = await zones.find({}).sort({ name: 1 }).toArray();
        res.json({ success: true, data: all.map(z => ({ ...z, _id: undefined })) });
    } catch (err) {
        next(err);
    }
});

// GET /api/zones/:name/stats — zone performance stats
router.get('/:name/stats', authenticateToken, checkRole('zone_manager', 'admin', 'super_admin'), async (req, res, next) => {
    try {
        const reports = await getCollection('reports');
        const zone = decodeURIComponent(req.params.name);

        const stats = await reports.aggregate([
            { $match: { zone } },
            { $group: {
                _id: '$status',
                count: { $sum: 1 }
            }},
            { $project: { _id: 0, status: '$_id', count: 1 } }
        ]).toArray();

        const wardStats = await reports.aggregate([
            { $match: { zone } },
            { $group: { _id: '$ward', count: { $sum: 1 } } },
            { $project: { _id: 0, ward: '$_id', count: 1 } }
        ]).toArray();

        res.json({ success: true, data: { zone, statusStats: stats, wardStats } });
    } catch (err) {
        next(err);
    }
});

// PATCH /api/zones/:name — update zone manager
router.patch('/:name', authenticateToken, checkRole('super_admin', 'admin'), async (req, res, next) => {
    try {
        const zones = await getCollection('zones');
        const { managerId } = req.body;
        const zone = decodeURIComponent(req.params.name);

        const result = await zones.updateOne({ name: zone }, { $set: { managerId, updatedAt: new Date().toISOString() } });
        if (!result.matchedCount) return next(new AppError('Zone not found', 404));

        res.json({ success: true, message: 'Zone updated' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
