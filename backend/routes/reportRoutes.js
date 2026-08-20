/**
 * RoadFix — Report Routes
 * All sensitive routes protected by JWT authentication middleware.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateToken, checkRole } = require('../middleware/auth');
const {
    getReports,
    getReportById,
    createReport,
    updateReportStatus,
    assignReport,
    getReportStats,
    deleteReport,
    upvoteReport
} = require('../controllers/reportController');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Public stats (used on home page)
router.get('/stats', getReportStats);

// Authenticated routes
router.get('/', authenticateToken, getReports);
router.get('/:id', authenticateToken, getReportById);
router.post('/', authenticateToken, upload.single('image'), createReport);

// Status update — officers, zone managers, admins
router.patch('/:id/status', authenticateToken, checkRole('municipal_officer', 'inspector', 'zone_manager', 'admin', 'super_admin'), updateReportStatus);

// Assign — zone managers and admins
router.patch('/:id/assign', authenticateToken, checkRole('zone_manager', 'admin', 'super_admin'), assignReport);

// Upvote — any authenticated user
router.patch('/:id/upvote', authenticateToken, upvoteReport);

// Delete — admins only
router.delete('/:id', authenticateToken, checkRole('admin', 'super_admin'), deleteReport);

module.exports = router;
