const express = require('express');
const router = express.Router();
const { getCollection } = require('../db/mongoClient');
const { appendAuditLog } = require('../db/auditDatabase');

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const users = await getCollection('users');
        const user = await users.findOne({ email, password });

        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const { password: _, _id, ...userData } = user;

        await appendAuditLog({
            action: 'user.login',
            actor: { id: userData.id, name: userData.name, role: userData.role },
            details: `User ${userData.name} logged in`
        });

        return res.json({ success: true, data: userData });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/logout', async (req, res) => {
    try {
        const actor = {
            id: req.headers['x-user-id'] || 'unknown',
            name: req.headers['x-user-name'] || 'Unknown User',
            role: req.headers['x-user-role'] || 'unknown'
        };

        await appendAuditLog({
            action: 'user.logout',
            actor,
            details: `User ${actor.name} logged out`
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/me', async (req, res) => {
    const userId = req.headers['x-user-id'];

    try {
        const users = await getCollection('users');
        const user = await users.findOne({ id: userId });

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const { password: _, _id, ...userData } = user;
        return res.json({ success: true, data: userData });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
