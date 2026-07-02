const SLA_TARGETS = {
    "Pothole": 7,
    "Blocked Drain": 3,
    "Streetlight Issue": 5,
    "Faded Road Signs": 14,
    "Other": 10
};

/**
 * Calculates current SLA status for a given report based on createdAt (UTC)
 * @param {Object} report
 * @returns {String} "resolved" | "breached" | "due-soon" | "on-track"
 */
function getSLAStatus(report) {
    if (report.status === "Resolved") {
        return "resolved";
    }

    const createdMs = new Date(report.createdAt).getTime();
    if (isNaN(createdMs)) return "on-track"; // Safety against malformed dates

    const targetDays = SLA_TARGETS[report.category] || SLA_TARGETS["Other"];
    const deadlineMs = createdMs + (targetDays * 24 * 60 * 60 * 1000);
    const nowMs = Date.now();

    if (nowMs > deadlineMs) {
        return "breached";
    } else if (deadlineMs - nowMs < 86400000) {
        return "due-soon";
    } else {
        return "on-track";
    }
}

/**
 * Returns a human readable string describing SLA deadline
 * @param {Object} report
 * @returns {String}
 */
function getSLADeadlineText(report) {
    if (report.status === "Resolved") {
        return "Resolved";
    }

    const createdMs = new Date(report.createdAt).getTime();
    if (isNaN(createdMs)) return "Unknown deadline";

    const targetDays = SLA_TARGETS[report.category] || SLA_TARGETS["Other"];
    const deadlineMs = createdMs + (targetDays * 24 * 60 * 60 * 1000);
    const nowMs = Date.now();

    const diffMs = deadlineMs - nowMs;
    const diffDays = Math.ceil(Math.abs(diffMs) / (24 * 60 * 60 * 1000));

    if (diffMs < 0) {
        if (diffDays === 1) return "Breached yesterday";
        return `Breached ${diffDays} days ago`;
    } else if (diffDays === 1) {
        return "Due tomorrow";
    } else {
        return `Due in ${diffDays} days`;
    }
}

// Attach to window if needed or let them be top-level script globals
window.SLA_TARGETS = SLA_TARGETS;
window.getSLAStatus = getSLAStatus;
window.getSLADeadlineText = getSLADeadlineText;
