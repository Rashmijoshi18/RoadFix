/**
 * RoadFix — Analytics Routes
 * Provides chart data for admin/zone manager dashboards.
 */

const express = require('express');
const router = express.Router();
const { getCollection } = require('../db/mongoClient');
const { authenticateToken, checkRole } = require('../middleware/auth');

// GET /api/analytics/overview — summary stats
router.get('/overview', authenticateToken, checkRole('admin', 'super_admin', 'zone_manager'), async (req, res, next) => {
    try {
        const reports = await getCollection('reports');
        const users = await getCollection('users');

        const [totalReports, totalUsers, statusStats, categoryStats] = await Promise.all([
            reports.countDocuments(),
            users.countDocuments({ isDeactivated: { $ne: true } }),
            reports.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } },
                { $project: { _id: 0, status: '$_id', count: 1 } }
            ]).toArray(),
            reports.aggregate([
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $project: { _id: 0, category: '$_id', count: 1 } }
            ]).toArray()
        ]);

        const resolvedCount = statusStats.find(s => s.status === 'Closed' || s.status === 'Completed')?.count || 0;
        const resolutionRate = totalReports > 0 ? Math.round((resolvedCount / totalReports) * 100) : 0;

        res.json({
            success: true,
            data: { totalReports, totalUsers, resolutionRate, statusStats, categoryStats }
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/analytics/monthly — monthly report trend (last 12 months)
router.get('/monthly', authenticateToken, checkRole('admin', 'super_admin', 'zone_manager'), async (req, res, next) => {
    try {
        const reports = await getCollection('reports');

        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
        twelveMonthsAgo.setDate(1);

        const monthly = await reports.aggregate([
            { $match: { createdAt: { $gte: twelveMonthsAgo.toISOString() } } },
            { $group: {
                _id: {
                    year: { $year: { $toDate: '$createdAt' } },
                    month: { $month: { $toDate: '$createdAt' } }
                },
                count: { $sum: 1 }
            }},
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]).toArray();

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const result = monthly.map(m => ({
            month: `${monthNames[m._id.month - 1]} ${m._id.year}`,
            count: m.count
        }));

        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// GET /api/analytics/officers — officer performance metrics
router.get('/officers', authenticateToken, checkRole('admin', 'super_admin', 'zone_manager'), async (req, res, next) => {
    try {
        const reports = await getCollection('reports');
        const users = await getCollection('users');

        const officers = await users.find({
            role: 'municipal_officer',
            isDeactivated: { $ne: true }
        }, { projection: { password: 0 } }).toArray();

        const performance = await Promise.all(officers.map(async (officer) => {
            const [assigned, completed] = await Promise.all([
                reports.countDocuments({ 'assignedTo.officerId': officer.id }),
                reports.countDocuments({ 'assignedTo.officerId': officer.id, status: { $in: ['Completed', 'Closed'] } })
            ]);

            return {
                officerId: officer.id,
                name: officer.name,
                zone: officer.zone || 'Unassigned',
                ward: officer.ward || 'Unassigned',
                assigned,
                completed,
                completionRate: assigned > 0 ? Math.round((completed / assigned) * 100) : 0
            };
        }));

        res.json({ success: true, data: performance });
    } catch (err) {
        next(err);
    }
});

// GET /api/analytics/wards — ward-wise complaint distribution
router.get('/wards', authenticateToken, checkRole('admin', 'super_admin', 'zone_manager'), async (req, res, next) => {
    try {
        const reports = await getCollection('reports');

        const wardStats = await reports.aggregate([
            { $group: {
                _id: '$ward',
                total: { $sum: 1 },
                pending: { $sum: { $cond: [{ $in: ['$status', ['Reported', 'Verified', 'Assigned', 'In Progress']] }, 1, 0] } },
                resolved: { $sum: { $cond: [{ $in: ['$status', ['Completed', 'Closed']] }, 1, 0] } }
            }},
            { $project: { _id: 0, ward: '$_id', total: 1, pending: 1, resolved: 1 } },
            { $sort: { total: -1 } }
        ]).toArray();

        res.json({ success: true, data: wardStats });
    } catch (err) {
        next(err);
    }
});

// GET /api/analytics/resolution-time — average resolution time by category
router.get('/resolution-time', authenticateToken, checkRole('admin', 'super_admin'), async (req, res, next) => {
    try {
        const reports = await getCollection('reports');

        const data = await reports.aggregate([
            { $match: { status: { $in: ['Completed', 'Closed'] }, completedAt: { $exists: true } } },
            { $project: {
                category: 1,
                daysToResolve: {
                    $divide: [
                        { $subtract: [{ $toDate: '$completedAt' }, { $toDate: '$createdAt' }] },
                        1000 * 60 * 60 * 24
                    ]
                }
            }},
            { $group: {
                _id: '$category',
                avgDays: { $avg: '$daysToResolve' },
                count: { $sum: 1 }
            }},
            { $project: { _id: 0, category: '$_id', avgDays: { $round: ['$avgDays', 1] }, count: 1 } }
        ]).toArray();

        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
