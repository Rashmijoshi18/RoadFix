const db = require('../db/database');
const { appendAuditLog } = require('../db/auditDatabase');

let io;
const setIO = (socketIO) => { io = socketIO; };

const getActor = (req) => ({
    id: req.headers['x-user-id'] || 'unknown',
    name: req.headers['x-user-name'] || 'Unknown User',
    role: req.headers['x-user-role'] || 'unknown'
});

const getReports = (req, res) => {
    const { category, status } = req.query;
    db.all('SELECT * FROM reports', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let records = rows;
        if (category) records = records.filter(r => r.category === category);
        if (status) records = records.filter(r => r.status === status);
        
        // Sorting by newest first
        records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json({ success: true, data: records });
    });
};

const createReport = (req, res) => {
    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: 'Request body is empty.' });
    }

    const { title, description, category, latitude, longitude, address } = req.body;
    let image_url = req.body.image_url;

    if (!title || !category) {
        return res.status(400).json({ error: 'Title and category are required.' });
    }

    if (req.file) {
        image_url = `/uploads/${req.file.filename}`;
    }

    const sql = `INSERT INTO reports (title, description, category, latitude, longitude, address, image_url)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const params = [title, description, category, parseFloat(latitude), parseFloat(longitude), address, image_url];

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        
        const reportId = this.lastID;
        const actor = getActor(req);

        // Fetch the new report to emit it
        db.all('SELECT * FROM reports', [], (err, rows) => {
            const newReport = rows.find(r => r.id == reportId);
            
            appendAuditLog({
                action: 'report.created',
                actor: actor,
                reportId: reportId.toString(),
                details: `Report #${reportId} titled '${title}' submitted in category ${category}`
            });

            // Emit socket event
            if (io) io.emit('report:new', newReport);

            res.status(201).json({
                success: true,
                data: { reportId }
            });
        });
    });
};

const updateReportStatus = (req, res) => {
    const { id } = req.params;
    const { status, solution } = req.body;

    if (!status) return res.status(400).json({ error: 'Status is required.' });

    db.all('SELECT * FROM reports', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const existing = rows.find(r => r.id == id);
        if (!existing) return res.status(404).json({ error: 'Report not found' });
        
        const oldStatus = existing.status;
        let sql = `UPDATE reports SET status = ?`;
        let params = [status];

        if (solution !== undefined) {
            sql += `, solution = ?`;
            params.push(solution);
        }
        sql += ` WHERE id = ?`;
        params.push(id);

        db.run(sql, params, function (err) {
            if (err) return res.status(500).json({ error: err.message });
            
            const updatedReport = { ...existing, status, solution: solution || existing.solution };

            appendAuditLog({
                action: 'report.status_changed',
                actor: getActor(req),
                reportId: id.toString(),
                details: `Status changed from ${oldStatus} to ${status} for report #${id}`
            });

            // Emit socket event
            if (io) io.emit('report:updated', updatedReport);

            res.json({ success: true, message: 'Status updated successfully' });
        });
    });
};

const upvoteReport = (req, res) => {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];

    if (!userId) return res.status(400).json({ success: false, error: 'User ID required for upvoting' });

    db.all('SELECT * FROM reports', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const existing = rows.find(r => r.id == id);
        if (!existing) return res.status(404).json({ error: 'Report not found' });

        if (!existing.upvotedBy) existing.upvotedBy = [];
        
        const index = existing.upvotedBy.indexOf(userId);
        if (index === -1) {
            existing.upvotedBy.push(userId); // Add upvote
        } else {
            existing.upvotedBy.splice(index, 1); // Remove upvote
        }

        db.run('UPDATE reports SET upvotedBy = ? WHERE id = ?', [JSON.stringify(existing.upvotedBy), id], function(err) {
            if (err) return res.status(500).json({ error: err.message });

            if (io) io.emit('report:upvoted', { id, upvotes: existing.upvotedBy.length, upvotedBy: existing.upvotedBy });

            res.json({ success: true, upvotes: existing.upvotedBy.length, isUpvoted: index === -1 });
        });
    });
};

const getReportStats = (req, res) => {
    db.all('SELECT * FROM reports', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const statsObj = rows.reduce((acc, report) => {
            acc[report.status] = (acc[report.status] || 0) + 1;
            return acc;
        }, {});
        
        const stats = Object.keys(statsObj).map(status => ({ status, count: statsObj[status] }));
        res.json({ success: true, data: stats });
    });
};

const deleteReport = (req, res) => {
    const { id } = req.params;
    const sql = `DELETE FROM reports WHERE id = ?`;
    db.run(sql, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        appendAuditLog({
            action: 'report.deleted',
            actor: getActor(req),
            reportId: id.toString(),
            details: `Report #${id} permanently deleted`
        });

        // Emit socket event
        if (io) io.emit('report:deleted', { id });

        res.json({ success: true, message: 'Report deleted successfully' });
    });
};

module.exports = {
    setIO,
    getReports,
    createReport,
    updateReportStatus,
    getReportStats,
    deleteReport,
    upvoteReport
};
