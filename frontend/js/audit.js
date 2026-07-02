document.addEventListener('DOMContentLoaded', () => {
    const mainContent = document.getElementById('mainContent');
    const role = localStorage.getItem('userRole');

    // Admin Only Guard
    if (role !== 'admin') {
        mainContent.innerHTML = `
            <div class="access-denied-card">
                <i class="fas fa-lock" style="font-size: 4rem; color: var(--danger);"></i>
                <h2>Access Denied</h2>
                <p>You do not have the required permissions to view the audit trail.</p>
                <a href="dashboard.html" class="btn btn-primary" style="margin-top: 1.5rem;">Return to Dashboard</a>
            </div>
        `;
        return;
    }

    // Build the normal UI
    buildAuditUI(mainContent);
    fetchAndRenderLogs();
});

let allLogs = [];

function buildAuditUI(container) {
    container.innerHTML = `
        <header class="dashboard-header" style="margin-bottom: 2rem;">
            <div>
                <h1>Audit <span>Trail.</span></h1>
                <p>Complete immutable activity log</p>
            </div>
        </header>

        <section class="filters-container">
            <div class="filter-group" style="width: 100%;">
                <label for="searchAction"><i class="fas fa-filter"></i> Filter by Action:</label>
                <input type="text" id="searchAction" placeholder="e.g. report.created, user.login" style="max-width: 400px;">
            </div>
        </section>

        <!-- Loader -->
        <div id="loader" style="display: none;">
            <div class="spinner"></div>
        </div>

        <section id="timelineContainer" class="timeline">
            <!-- Logs injected here -->
        </section>
    `;

    document.getElementById('searchAction').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = allLogs.filter(log => log.action.toLowerCase().includes(searchTerm));
        renderTimeline(filtered);
    });
}

async function fetchAndRenderLogs() {
    const loader = document.getElementById('loader');
    const timeline = document.getElementById('timelineContainer');
    
    loader.style.display = 'block';
    
    try {
        const response = await fetch('/api/audit', {
            headers: {
                'x-user-role': localStorage.getItem('userRole')
            }
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            allLogs = data.data;
            renderTimeline(allLogs);
        } else {
            timeline.innerHTML = `<div class="message error">Failed to load audit logs: ${data.error}</div>`;
        }
    } catch (err) {
        console.error(err);
        timeline.innerHTML = `<div class="message error">Network error while fetching audit logs.</div>`;
    } finally {
        loader.style.display = 'none';
    }
}

function renderTimeline(logs) {
    const timeline = document.getElementById('timelineContainer');
    
    if (!logs || logs.length === 0) {
        timeline.innerHTML = `<p style="color: var(--text-muted); text-align: center;">No activity logs found.</p>`;
        return;
    }

    timeline.innerHTML = logs.map(log => {
        const dateObj = new Date(log.timestamp);
        // Format: "15 Apr 2026, 10:32 AM"
        const formatter = new Intl.DateTimeFormat('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
        const formattedTime = formatter.format(dateObj);
        
        let iconClass = 'fas fa-info';
        let colorClass = 'icon-user-login'; // default
        
        if (log.action === 'report.created') {
            iconClass = 'fas fa-plus';
            colorClass = 'icon-report-created';
        } else if (log.action === 'report.status_changed') {
            iconClass = 'fas fa-sync-alt';
            colorClass = 'icon-report-status_changed';
        } else if (log.action === 'report.deleted') {
            iconClass = 'fas fa-trash';
            colorClass = 'icon-report-deleted';
        } else if (log.action === 'user.login') {
            iconClass = 'fas fa-sign-in-alt';
            colorClass = 'icon-user-login';
        } else if (log.action === 'user.logout') {
            iconClass = 'fas fa-sign-out-alt';
            colorClass = 'icon-user-logout';
        }

        const actorRole = log.actor?.role || 'unknown';
        const roleBadge = `<span class="badge" style="font-size: 0.65rem; padding: 0.2rem 0.5rem; background: var(--border-strong); color: var(--text-primary); text-transform: uppercase;">${actorRole}</span>`;
        const actorName = log.actor?.name || 'Unknown';

        // Basic HTML escaper
        const escapeHTML = (str) => {
            if (!str) return str;
            return str.replace(/[&<>'"]/g, 
                tag => ({
                    '&': '&amp;', '<': '&lt;', '>': '&gt;',
                    "'": '&#39;', '"': '&quot;'
                }[tag])
            );
        };

        return `
            <div class="timeline-item">
                <div class="timeline-icon ${colorClass}">
                    <i class="${iconClass}"></i>
                </div>
                <div class="timeline-time">${formattedTime}</div>
                <div class="timeline-header">
                    <span class="timeline-actor">${escapeHTML(actorName)}</span>
                    ${roleBadge}
                    <span style="color: var(--text-muted); font-size: 0.9rem;">— ${escapeHTML(log.action)}</span>
                </div>
                <div class="timeline-details">
                    ${escapeHTML(log.details)}
                </div>
            </div>
        `;
    }).join('');
}
