const { ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const { getCollection } = require('../db/mongoClient');
const { appendAuditLog } = require('../db/auditDatabase');

let io;
const setIO = (socketIO) => { io = socketIO; };

const getActor = (req) => ({
    id: req.headers['x-user-id'] || 'unknown',
    name: req.headers['x-user-name'] || 'Unknown User',
    role: req.headers['x-user-role'] || 'unknown'
});

const mapReport = (doc) => {
    if (!doc) return null;

    return {
        ...doc,
        id: doc._id.toString(),
        createdAt: doc.createdAt || doc.created_at || new Date().toISOString()
    };
};

const toObjectId = (id) => {
    if (!ObjectId.isValid(id)) return null;
    return new ObjectId(id);
};

const getReports = async (req, res) => {
    try {
        const { category, status } = req.query;
        const reports = await getCollection('reports');

        const filter = {};
        if (category) filter.category = category;
        if (status) filter.status = status;

        const rows = await reports.find(filter).sort({ createdAt: -1 }).toArray();
        res.json({ success: true, data: rows.map(mapReport) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const createReport = async (req, res) => {
    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: 'Request body is empty.' });
    }

    const { title, description, category, latitude, longitude, address } = req.body;
    let image_url = req.body.image_url;

    if (!title || !category) {
        return res.status(400).json({ error: 'Title and category are required.' });
    }

    if (req.file) {
        if (process.env.VERCEL) {
            // Vercel filesystem is ephemeral, so keep image content with the report.
            image_url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        } else {
            const uploadDir = req.app?.locals?.uploadDir || path.join(__dirname, '../uploads');
            const ext = path.extname(req.file.originalname || '') || '.jpg';
            const filename = `${req.file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
            const filePath = path.join(uploadDir, filename);
            fs.writeFileSync(filePath, req.file.buffer);
            image_url = `/uploads/${filename}`;
        }
    }

    try {
        const reports = await getCollection('reports');
        const insertPayload = {
            title,
            description,
            category,
            latitude: Number.isFinite(parseFloat(latitude)) ? parseFloat(latitude) : null,
            longitude: Number.isFinite(parseFloat(longitude)) ? parseFloat(longitude) : null,
            address,
            image_url,
            status: 'Reported',
            solution: null,
            createdAt: new Date().toISOString(),
            upvotedBy: []
        };

        const result = await reports.insertOne(insertPayload);
        const reportId = result.insertedId.toString();
        const actor = getActor(req);

        const newReport = mapReport({ _id: result.insertedId, ...insertPayload });

        await appendAuditLog({
            action: 'report.created',
            actor,
            reportId,
            details: `Report #${reportId} titled '${title}' submitted in category ${category}`
        });

        if (io) io.emit('report:new', newReport);

        res.status(201).json({
            success: true,
            data: { reportId }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const updateReportStatus = async (req, res) => {
    const { id } = req.params;
    const { status, solution } = req.body;

    if (!status) return res.status(400).json({ error: 'Status is required.' });
    const objectId = toObjectId(id);
    if (!objectId) return res.status(400).json({ error: 'Invalid report ID' });

    try {
        const reports = await getCollection('reports');
        const existing = await reports.findOne({ _id: objectId });
        if (!existing) return res.status(404).json({ error: 'Report not found' });

        const oldStatus = existing.status;
        const updateDoc = { status };
        if (solution !== undefined) updateDoc.solution = solution;

        const updated = await reports.findOneAndUpdate(
            { _id: objectId },
            { $set: updateDoc },
            { returnDocument: 'after' }
        );
        const updatedReport = updated && updated.value ? updated.value : updated;

        await appendAuditLog({
            action: 'report.status_changed',
            actor: getActor(req),
            reportId: id.toString(),
            details: `Status changed from ${oldStatus} to ${status} for report #${id}`
        });

        if (io) io.emit('report:updated', mapReport(updatedReport));

        res.json({ success: true, message: 'Status updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const upvoteReport = async (req, res) => {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];

    if (!userId) return res.status(400).json({ success: false, error: 'User ID required for upvoting' });
    const objectId = toObjectId(id);
    if (!objectId) return res.status(400).json({ error: 'Invalid report ID' });

    try {
        const reports = await getCollection('reports');
        const existing = await reports.findOne({ _id: objectId });
        if (!existing) return res.status(404).json({ error: 'Report not found' });

        const currentUpvotes = Array.isArray(existing.upvotedBy) ? existing.upvotedBy : [];
        const index = currentUpvotes.indexOf(userId);
        let isUpvoted = false;

        if (index === -1) {
            currentUpvotes.push(userId);
            isUpvoted = true;
        } else {
            currentUpvotes.splice(index, 1);
        }

        await reports.updateOne({ _id: objectId }, { $set: { upvotedBy: currentUpvotes } });

        if (io) io.emit('report:upvoted', { id, upvotes: currentUpvotes.length, upvotedBy: currentUpvotes });

        res.json({ success: true, upvotes: currentUpvotes.length, isUpvoted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const getReportStats = async (req, res) => {
    try {
        const reports = await getCollection('reports');
        const stats = await reports.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $project: { _id: 0, status: '$_id', count: 1 } }
        ]).toArray();

        res.json({ success: true, data: stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const deleteReport = async (req, res) => {
    const { id } = req.params;
    const objectId = toObjectId(id);
    if (!objectId) return res.status(400).json({ error: 'Invalid report ID' });

    try {
        const reports = await getCollection('reports');
        const result = await reports.deleteOne({ _id: objectId });
        if (!result.deletedCount) return res.status(404).json({ error: 'Report not found' });

        await appendAuditLog({
            action: 'report.deleted',
            actor: getActor(req),
            reportId: id.toString(),
            details: `Report #${id} permanently deleted`
        });

        if (io) io.emit('report:deleted', { id });

        res.json({ success: true, message: 'Report deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
