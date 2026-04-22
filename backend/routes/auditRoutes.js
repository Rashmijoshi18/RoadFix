const express = require('express');
const router = express.Router();
const checkRole = require('../middleware/checkRole');
const { getAllAuditLogs } = require('../db/auditDatabase');

// GET /api/audit — returns all logs, protected for admin only
router.get('/', checkRole(['admin']), (req, res) => {
    try {
        const logs = getAllAuditLogs();
        return res.json({ success: true, data: logs, error: null });
    } catch (err) {
        console.error('Audit GET Error:', err.message);
        return res.status(500).json({ success: false, data: null, error: 'Failed to fetch audit logs.' });
    }
});

// No DELETE endpoint because logs are immutable

module.exports = router;
