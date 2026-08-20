const express = require('express');
const router = express.Router();
const { authenticateToken, checkRole } = require('../middleware/auth');
const { getAllAuditLogs } = require('../db/auditDatabase');

// GET /api/audit — admin-only audit log
router.get('/', authenticateToken, checkRole('admin', 'super_admin'), async (req, res, next) => {
    try {
        const logs = await getAllAuditLogs();
        return res.json({ success: true, data: logs, error: null });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
