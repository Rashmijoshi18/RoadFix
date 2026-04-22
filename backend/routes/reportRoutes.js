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

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../uploads/'));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
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
