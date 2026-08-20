/**
 * RoadFix — Report Controller
 *
 * All identity now comes from req.user (set by JWT middleware).
 * Supports extended complaint workflow:
 * Reported → Verified → Assigned → In Progress → Completed → Closed
 *
 * Report model additions:
 *   priority      : 'Low' | 'Medium' | 'High' | 'Critical'
 *   ward          : string | null
 *   zone          : string | null
 *   assignedTo    : { officerId, officerName } | null
 *   statusTimeline: [{ status, changedBy, changedAt, note }]
 *   severity      : AI-assigned severity string
 *   aiAnalysis    : AI analysis result object
 *   reportedBy    : { userId, userName }
 */

const { ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const { getCollection } = require('../db/mongoClient');
const { appendAuditLog } = require('../db/auditDatabase');
const logger = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');

// ─── Socket.IO injection ──────────────────────────────────────────────────────
let io;
const setIO = (socketIO) => { io = socketIO; };

// ─── Allowed status transitions ───────────────────────────────────────────────
const STATUS_TRANSITIONS = {
    'Reported':     ['Verified', 'Closed'],
    'Verified':     ['Assigned', 'Closed'],
    'Assigned':     ['In Progress', 'Closed'],
    'In Progress':  ['Completed', 'Closed'],
    'Completed':    ['Closed'],
    'Closed':       []  // Terminal state
};

const VALID_STATUSES = Object.keys(STATUS_TRANSITIONS);
const VALID_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toObjectId = (id) => {
    if (!ObjectId.isValid(id)) return null;
    return new ObjectId(id);
};

const mapReport = (doc) => {
    if (!doc) return null;
    return {
        ...doc,
        id: doc._id.toString(),
        createdAt: doc.createdAt || new Date().toISOString()
    };
};

// ─── GET /api/reports ─────────────────────────────────────────────────────────
const getReports = async (req, res, next) => {
    try {
        const { category, status, ward, priority, officerId, page = 1, limit = 50 } = req.query;
        const reports = await getCollection('reports');

        const filter = {};
        if (category) filter.category = category;
        if (status) filter.status = status;
        if (ward) filter.ward = ward;
        if (priority) filter.priority = priority;
        if (officerId) filter['assignedTo.officerId'] = officerId;

        // Citizens can only see their own reports if not admin/zone_manager/super_admin
        const role = req.user?.role;
        if (role === 'citizen') {
            filter['reportedBy.userId'] = req.user.id;
        } else if (role === 'municipal_officer') {
            // Officers see their assigned reports + unassigned
            filter.$or = [
                { 'assignedTo.officerId': req.user.id },
                { assignedTo: null },
                { assignedTo: { $exists: false } }
            ];
        } else if (role === 'zone_manager') {
            if (req.user.zone) filter.zone = req.user.zone;
        }

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const [rows, total] = await Promise.all([
            reports.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).toArray(),
            reports.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: rows.map(mapReport),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (err) {
        next(err);
    }
};

// ─── GET /api/reports/:id ─────────────────────────────────────────────────────
const getReportById = async (req, res, next) => {
    const objectId = toObjectId(req.params.id);
    if (!objectId) return next(new AppError('Invalid report ID', 400));

    try {
        const reports = await getCollection('reports');
        const doc = await reports.findOne({ _id: objectId });
        if (!doc) return next(new AppError('Report not found', 404));

        res.json({ success: true, data: mapReport(doc) });
    } catch (err) {
        next(err);
    }
};

// ─── POST /api/reports ────────────────────────────────────────────────────────
const createReport = async (req, res, next) => {
    if (!req.body || Object.keys(req.body).length === 0) {
        return next(new AppError('Request body is empty.', 400));
    }

    const { title, description, category, latitude, longitude, address, priority, aiAnalysis } = req.body;

    if (!title || !category) {
        return next(new AppError('Title and category are required.', 400));
    }

    let image_url = req.body.image_url || null;

    // Handle file upload
    if (req.file) {
        if (process.env.VERCEL) {
            image_url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        } else {
            const uploadDir = req.app?.locals?.uploadDir || path.join(__dirname, '../uploads');
            const ext = path.extname(req.file.originalname || '') || '.jpg';
            const filename = `report-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
            const filePath = path.join(uploadDir, filename);
            fs.writeFileSync(filePath, req.file.buffer);
            image_url = `/uploads/${filename}`;
        }
    }

    // Parse AI analysis if passed as JSON string
    let parsedAiAnalysis = null;
    if (aiAnalysis) {
        try {
            parsedAiAnalysis = typeof aiAnalysis === 'string' ? JSON.parse(aiAnalysis) : aiAnalysis;
        } catch {
            parsedAiAnalysis = null;
        }
    }

    const lat = Number.isFinite(parseFloat(latitude)) ? parseFloat(latitude) : null;
    const lng = Number.isFinite(parseFloat(longitude)) ? parseFloat(longitude) : null;

    try {
        const reports = await getCollection('reports');

        const now = new Date().toISOString();
        const insertPayload = {
            title: title.trim(),
            description: description?.trim() || '',
            category,
            latitude: lat,
            longitude: lng,
            address: address?.trim() || '',
            image_url,
            status: 'Reported',
            priority: VALID_PRIORITIES.includes(priority) ? priority : 'Medium',
            severity: parsedAiAnalysis?.severity || 'Medium',
            ward: req.user?.ward || null,
            zone: req.user?.zone || null,
            assignedTo: null,
            solution: null,
            completionImages: [],
            upvotedBy: [],
            reportedBy: {
                userId: req.user?.id || 'anonymous',
                userName: req.user?.name || 'Anonymous'
            },
            statusTimeline: [{
                status: 'Reported',
                changedBy: req.user?.name || 'System',
                changedById: req.user?.id || 'system',
                changedAt: now,
                note: 'Complaint submitted by citizen'
            }],
            aiAnalysis: parsedAiAnalysis,
            createdAt: now,
            updatedAt: now
        };

        const result = await reports.insertOne(insertPayload);
        const reportId = result.insertedId.toString();
        const newReport = mapReport({ _id: result.insertedId, ...insertPayload });

        // Award points to citizen for submitting a report
        if (req.user?.role === 'citizen') {
            try {
                const users = await getCollection('users');
                await users.updateOne({ id: req.user.id }, { $inc: { points: 10 } });
                await updateUserLevel(req.user.id);
            } catch (pointsErr) {
                logger.warn(`Failed to award points to ${req.user.id}: ${pointsErr.message}`);
            }
        }

        // Create in-app notification for admin/zone_manager
        await createSystemNotification({
            type: 'new_complaint',
            title: 'New Complaint Submitted',
            body: `"${title}" was reported in ${address || 'unknown location'}`,
            targetRoles: ['super_admin', 'zone_manager', 'admin'],
            reportId,
            createdAt: now
        });

        await appendAuditLog({
            action: 'report.created',
            actor: { id: req.user?.id, name: req.user?.name, role: req.user?.role },
            reportId,
            details: `Report #${reportId} "${title}" submitted (${category})`
        });

        if (io) io.emit('report:new', newReport);

        logger.info(`Report created: #${reportId} by ${req.user?.email || 'anonymous'}`);

        res.status(201).json({ success: true, data: { reportId, report: newReport } });
    } catch (err) {
        next(err);
    }
};

// ─── PATCH /api/reports/:id/status ───────────────────────────────────────────
const updateReportStatus = async (req, res, next) => {
    const role = req.user?.role;
    const allowedRoles = ['admin', 'super_admin', 'inspector', 'municipal_officer', 'zone_manager'];
    if (!allowedRoles.includes(role)) {
        return next(new AppError('Access denied. Only staff can update report status.', 403));
    }

    const { id } = req.params;
    const { status, solution, note, priority, assignedTo } = req.body;

    if (!status) return next(new AppError('Status is required.', 400));
    if (!VALID_STATUSES.includes(status)) {
        return next(new AppError(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400));
    }

    const objectId = toObjectId(id);
    if (!objectId) return next(new AppError('Invalid report ID', 400));

    try {
        const reports = await getCollection('reports');
        const existing = await reports.findOne({ _id: objectId });
        if (!existing) return next(new AppError('Report not found', 404));

        const oldStatus = existing.status;

        // Enforce transition rules
        const allowed = STATUS_TRANSITIONS[oldStatus] || [];
        if (!allowed.includes(status)) {
            return next(new AppError(
                `Invalid status transition: ${oldStatus} → ${status}. Allowed: ${allowed.join(', ') || 'none (terminal)'}`,
                400
            ));
        }

        const now = new Date().toISOString();
        const timelineEntry = {
            status,
            changedBy: req.user.name,
            changedById: req.user.id,
            changedAt: now,
            note: note || null
        };

        const updateDoc = {
            status,
            updatedAt: now,
            $push: { statusTimeline: timelineEntry }
        };

        if (solution !== undefined) updateDoc.solution = solution;
        if (priority && VALID_PRIORITIES.includes(priority)) updateDoc.priority = priority;
        if (assignedTo) updateDoc.assignedTo = assignedTo;
        if (status === 'Completed') updateDoc.completedAt = now;

        const { $push, ...setFields } = updateDoc;
        await reports.updateOne({ _id: objectId }, {
            $set: setFields,
            ...(timelineEntry && { $push: { statusTimeline: timelineEntry } })
        });

        const updated = await reports.findOne({ _id: objectId });

        // Notify the reporting citizen
        if (existing.reportedBy?.userId) {
            await createSystemNotification({
                type: 'status_update',
                title: 'Complaint Status Updated',
                body: `Your complaint "${existing.title}" is now ${status}.`,
                targetUserId: existing.reportedBy.userId,
                reportId: id,
                createdAt: now
            });

            if (io) {
                io.to(`user:${existing.reportedBy.userId}`).emit('notification:new', {
                    type: 'status_update',
                    reportId: id,
                    status
                });
            }
        }

        // Award points if completed
        if (status === 'Completed' && existing.reportedBy?.userId) {
            try {
                const users = await getCollection('users');
                await users.updateOne({ id: existing.reportedBy.userId }, { $inc: { points: 50 } });
                await updateUserLevel(existing.reportedBy.userId);
            } catch (pointsErr) {
                logger.warn(`Failed to award completion points: ${pointsErr.message}`);
            }
        }

        await appendAuditLog({
            action: 'report.status_changed',
            actor: { id: req.user.id, name: req.user.name, role: req.user.role },
            reportId: id,
            details: `Status: ${oldStatus} → ${status} | Note: ${note || 'None'}`
        });

        if (io) io.emit('report:updated', mapReport(updated));

        logger.info(`Report #${id} status: ${oldStatus} → ${status} by ${req.user.email}`);

        res.json({ success: true, message: 'Status updated successfully', data: mapReport(updated) });
    } catch (err) {
        next(err);
    }
};

// ─── PATCH /api/reports/:id/upvote ───────────────────────────────────────────
const upvoteReport = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) return next(new AppError('Authentication required to upvote', 401));

    const objectId = toObjectId(id);
    if (!objectId) return next(new AppError('Invalid report ID', 400));

    try {
        const reports = await getCollection('reports');
        const existing = await reports.findOne({ _id: objectId });
        if (!existing) return next(new AppError('Report not found', 404));

        const currentUpvotes = Array.isArray(existing.upvotedBy) ? existing.upvotedBy : [];
        const index = currentUpvotes.indexOf(userId);
        let isUpvoted = false;

        if (index === -1) {
            currentUpvotes.push(userId);
            isUpvoted = true;
            // Award points for upvoting
            const users = await getCollection('users');
            await users.updateOne({ id: userId }, { $inc: { points: 2 } });
            await updateUserLevel(userId);
        } else {
            currentUpvotes.splice(index, 1);
        }

        await reports.updateOne({ _id: objectId }, { $set: { upvotedBy: currentUpvotes } });

        if (io) io.emit('report:upvoted', { id, upvotes: currentUpvotes.length, upvotedBy: currentUpvotes });

        res.json({ success: true, upvotes: currentUpvotes.length, isUpvoted });
    } catch (err) {
        next(err);
    }
};

// ─── GET /api/reports/stats ───────────────────────────────────────────────────
const getReportStats = async (req, res, next) => {
    try {
        const reports = await getCollection('reports');

        const [statusStats, categoryStats, priorityStats] = await Promise.all([
            reports.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } },
                { $project: { _id: 0, status: '$_id', count: 1 } }
            ]).toArray(),
            reports.aggregate([
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $project: { _id: 0, category: '$_id', count: 1 } }
            ]).toArray(),
            reports.aggregate([
                { $group: { _id: '$priority', count: { $sum: 1 } } },
                { $project: { _id: 0, priority: '$_id', count: 1 } }
            ]).toArray()
        ]);

        res.json({
            success: true,
            data: { statusStats, categoryStats, priorityStats }
        });
    } catch (err) {
        next(err);
    }
};

// ─── DELETE /api/reports/:id ──────────────────────────────────────────────────
const deleteReport = async (req, res, next) => {
    const role = req.user?.role;
    if (!['admin', 'super_admin'].includes(role)) {
        return next(new AppError('Only admins can delete reports.', 403));
    }

    const { id } = req.params;
    const objectId = toObjectId(id);
    if (!objectId) return next(new AppError('Invalid report ID', 400));

    try {
        const reports = await getCollection('reports');
        const doc = await reports.findOne({ _id: objectId });
        if (!doc) return next(new AppError('Report not found', 404));

        // Delete local image file if applicable
        if (doc.image_url && doc.image_url.startsWith('/uploads/')) {
            const uploadDir = path.join(__dirname, '../uploads');
            const filePath = path.join(uploadDir, path.basename(doc.image_url));
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await reports.deleteOne({ _id: objectId });

        await appendAuditLog({
            action: 'report.deleted',
            actor: { id: req.user.id, name: req.user.name, role: req.user.role },
            reportId: id,
            details: `Report #${id} "${doc.title}" permanently deleted`
        });

        if (io) io.emit('report:deleted', { id });

        logger.info(`Report #${id} deleted by ${req.user.email}`);
        res.json({ success: true, message: 'Report deleted successfully' });
    } catch (err) {
        next(err);
    }
};

// ─── PATCH /api/reports/:id/assign ───────────────────────────────────────────
const assignReport = async (req, res, next) => {
    const role = req.user?.role;
    if (!['admin', 'super_admin', 'zone_manager'].includes(role)) {
        return next(new AppError('Access denied. Only zone managers and admins can assign reports.', 403));
    }

    const { id } = req.params;
    const { officerId, officerName, ward, zone } = req.body;

    if (!officerId || !officerName) {
        return next(new AppError('Officer ID and name are required for assignment.', 400));
    }

    const objectId = toObjectId(id);
    if (!objectId) return next(new AppError('Invalid report ID', 400));

    try {
        const reports = await getCollection('reports');
        const existing = await reports.findOne({ _id: objectId });
        if (!existing) return next(new AppError('Report not found', 404));

        const now = new Date().toISOString();
        const newStatus = 'Assigned';

        await reports.updateOne({ _id: objectId }, {
            $set: {
                assignedTo: { officerId, officerName },
                status: newStatus,
                ward: ward || existing.ward,
                zone: zone || existing.zone,
                updatedAt: now
            },
            $push: {
                statusTimeline: {
                    status: newStatus,
                    changedBy: req.user.name,
                    changedById: req.user.id,
                    changedAt: now,
                    note: `Assigned to ${officerName}`
                }
            }
        });

        const updated = await reports.findOne({ _id: objectId });

        // Notify officer
        await createSystemNotification({
            type: 'complaint_assigned',
            title: 'Complaint Assigned to You',
            body: `"${existing.title}" has been assigned to you for resolution.`,
            targetUserId: officerId,
            reportId: id,
            createdAt: now
        });

        if (io) {
            io.to(`user:${officerId}`).emit('notification:new', { type: 'complaint_assigned', reportId: id });
            io.emit('report:updated', mapReport(updated));
        }

        await appendAuditLog({
            action: 'report.assigned',
            actor: { id: req.user.id, name: req.user.name, role: req.user.role },
            reportId: id,
            details: `Assigned to ${officerName} (${officerId})`
        });

        res.json({ success: true, message: `Report assigned to ${officerName}`, data: mapReport(updated) });
    } catch (err) {
        next(err);
    }
};

// ─── Utility: create system notification ─────────────────────────────────────
async function createSystemNotification({ type, title, body, targetUserId, targetRoles, reportId, createdAt }) {
    try {
        const notifications = await getCollection('notifications');
        await notifications.insertOne({
            type,
            title,
            body,
            targetUserId: targetUserId || null,
            targetRoles: targetRoles || [],
            reportId: reportId || null,
            isRead: false,
            createdAt: createdAt || new Date().toISOString()
        });
    } catch (err) {
        logger.warn(`Failed to create notification: ${err.message}`);
    }
}

// ─── Utility: update user level based on points ───────────────────────────────
async function updateUserLevel(userId) {
    try {
        const users = await getCollection('users');
        const user = await users.findOne({ id: userId }, { projection: { points: 1 } });
        if (!user) return;

        const points = user.points || 0;
        let level = 'Bronze';
        if (points >= 2000) level = 'Platinum';
        else if (points >= 500) level = 'Gold';
        else if (points >= 100) level = 'Silver';

        await users.updateOne({ id: userId }, { $set: { level } });
    } catch (err) {
        logger.warn(`Level update failed for ${userId}: ${err.message}`);
    }
}

module.exports = {
    setIO,
    getReports,
    getReportById,
    createReport,
    updateReportStatus,
    assignReport,
    getReportStats,
    deleteReport,
    upvoteReport,
    createSystemNotification
};
