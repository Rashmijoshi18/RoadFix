const crypto = require('crypto');
const { getCollection } = require('./mongoClient');

/**
 * Return all audit logs, sorted newest first
 */
async function getAllAuditLogs() {
    const collection = await getCollection('audit_logs');
    return collection.find({}).sort({ timestamp: -1 }).toArray();
}

/**
 * Appends a new audit log to the text file
 * @param {Object} entryData - Contains action, actor, reportId (optional), details
 */
async function appendAuditLog(entryData) {
    const collection = await getCollection('audit_logs');

    const entry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action: entryData.action,
        actor: entryData.actor,
        reportId: entryData.reportId || null,
        details: entryData.details || ''
    };

    await collection.insertOne(entry);
    return entry;
}

module.exports = {
    getAllAuditLogs,
    appendAuditLog
};
