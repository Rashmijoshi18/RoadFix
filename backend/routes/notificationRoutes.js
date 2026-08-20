/**
 * RoadFix — Notification Routes
 */

const express = require('express');
const router = express.Router();
const { getCollection } = require('../db/mongoClient');
const { authenticateToken } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

// GET /api/notifications — user's notifications
router.get('/', authenticateToken, async (req, res, next) => {
    try {
        const notifications = await getCollection('notifications');
        const userId = req.user.id;
        const role = req.user.role;

        const query = {
            $or: [
                { targetUserId: userId },
                { targetRoles: role }
            ]
        };

        const notifs = await notifications
            .find(query)
            .sort({ createdAt: -1 })
            .limit(50)
            .toArray();

        const unreadCount = await notifications.countDocuments({ ...query, isRead: false });

        res.json({ success: true, data: notifs.map(n => ({ ...n, _id: undefined })), unreadCount });
    } catch (err) {
        next(err);
    }
});

// PATCH /api/notifications/:id/read — mark one as read
router.patch('/:id/read', authenticateToken, async (req, res, next) => {
    try {
        const { ObjectId } = require('mongodb');
        const notifications = await getCollection('notifications');

        if (!ObjectId.isValid(req.params.id)) return next(new AppError('Invalid ID', 400));

        await notifications.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { isRead: true } }
        );

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// PATCH /api/notifications/read-all — mark all as read
router.patch('/read-all', authenticateToken, async (req, res, next) => {
    try {
        const notifications = await getCollection('notifications');
        const userId = req.user.id;
        const role = req.user.role;

        await notifications.updateMany(
            { $or: [{ targetUserId: userId }, { targetRoles: role }], isRead: false },
            { $set: { isRead: true } }
        );

        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
