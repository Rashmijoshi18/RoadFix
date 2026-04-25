const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
    getReports,
    createReport,
    updateReportStatus,
    getReportStats,
    deleteReport,
    upvoteReport
} = require('../controllers/reportController');

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Routes
router.get('/', getReports);
router.post('/', upload.single('image'), createReport); 
router.patch('/:id/status', updateReportStatus);
router.patch('/:id/upvote', upvoteReport);
router.delete('/:id', deleteReport);
router.get('/stats', getReportStats);

module.exports = router;
