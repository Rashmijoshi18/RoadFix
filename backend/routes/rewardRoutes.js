/**
 * RoadFix — Rewards & Leaderboard Routes
 */

const express = require('express');
const router = express.Router();
const { getCollection } = require('../db/mongoClient');
const { authenticateToken } = require('../middleware/auth');

// GET /api/rewards/leaderboard — top 20 citizens by points
router.get('/leaderboard', authenticateToken, async (req, res, next) => {
    try {
        const users = await getCollection('users');

        const leaders = await users.find(
            { role: 'citizen', isDeactivated: { $ne: true } },
            { projection: { password: 0, email: 0, _id: 0 } }
        ).sort({ points: -1 }).limit(20).toArray();

        // Attach rank
        const leaderboard = leaders.map((u, i) => ({ ...u, rank: i + 1 }));

        // Find current user's rank if not in top 20
        const userId = req.user.id;
        const isInTop20 = leaderboard.some(l => l.id === userId);
        let currentUserRank = null;

        if (!isInTop20 && req.user.role === 'citizen') {
            const currentUser = await users.findOne({ id: userId }, { projection: { points: 1 } });
            if (currentUser) {
                const rank = await users.countDocuments({ role: 'citizen', points: { $gt: currentUser.points || 0 } });
                currentUserRank = { rank: rank + 1, points: currentUser.points || 0 };
            }
        }

        res.json({ success: true, data: { leaderboard, currentUserRank } });
    } catch (err) {
        next(err);
    }
});

// GET /api/rewards/me — current user's reward info
router.get('/me', authenticateToken, async (req, res, next) => {
    try {
        const users = await getCollection('users');
        const user = await users.findOne({ id: req.user.id }, { projection: { points: 1, level: 1, name: 1 } });
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        const points = user.points || 0;
        const LEVELS = [
            { name: 'Bronze', min: 0, max: 99, icon: '🥉', color: '#CD7F32' },
            { name: 'Silver', min: 100, max: 499, icon: '🥈', color: '#C0C0C0' },
            { name: 'Gold', min: 500, max: 1999, icon: '🥇', color: '#FFD700' },
            { name: 'Platinum', min: 2000, max: Infinity, icon: '💎', color: '#E5E4E2' }
        ];

        const currentLevel = LEVELS.find(l => points >= l.min && points <= l.max) || LEVELS[0];
        const nextLevel = LEVELS[LEVELS.indexOf(currentLevel) + 1] || null;
        const progress = nextLevel
            ? Math.round(((points - currentLevel.min) / (nextLevel.min - currentLevel.min)) * 100)
            : 100;

        res.json({
            success: true,
            data: {
                points,
                level: currentLevel,
                nextLevel,
                progress,
                name: user.name
            }
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
