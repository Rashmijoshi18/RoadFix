const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Persist the audit log inside db/
const auditPath = path.join(__dirname, 'audit.txt');

// Initialize the file if it doesn't exist
if (!fs.existsSync(auditPath)) {
    fs.writeFileSync(auditPath, JSON.stringify([]), 'utf-8');
}

/**
 * Return all audit logs, sorted newest first
 */
function getAllAuditLogs() {
    try {
        const data = fs.readFileSync(auditPath, 'utf-8');
        const logs = data ? JSON.parse(data) : [];
        return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (err) {
        console.error('Error reading audit logs:', err.message);
        return [];
    }
}

/**
 * Appends a new audit log to the text file
 * @param {Object} entryData - Contains action, actor, reportId (optional), details
 */
function appendAuditLog(entryData) {
    try {
        const logs = getAllAuditLogs();
        
        // Construct the log entry based on the requested shape
        const entry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            action: entryData.action, // e.g., 'report.created'
            actor: entryData.actor,   // { id, name, role }
            reportId: entryData.reportId || null,
            details: entryData.details || ''
        };

        // We use getAllAuditLogs which returns newest first, so to append
        // we must write back all items. The easiest way is to push and re-sort.
        logs.push(entry);
        
        fs.writeFileSync(auditPath, JSON.stringify(logs, null, 2), 'utf-8');
        return entry;
    } catch (err) {
        console.error('Error appending audit log:', err.message);
    }
}

module.exports = {
    getAllAuditLogs,
    appendAuditLog
};
