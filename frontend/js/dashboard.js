const API_URL = '/api/reports';
let currentServerReports = [];

function getReportDate(report) {
    return report.createdAt || report.created_at || report.created || new Date().toISOString();
}

function normalizeReport(report) {
    if (!report) return report;

    return {
        ...report,
        id: report.id ?? report._id,
        createdAt: getReportDate(report)
    };
}

// ---- RBAC: Read role from localStorage ----
function getUserRole() {
    return (localStorage.getItem('userRole') || '').toLowerCase();
}

function getUserName() {
    return localStorage.getItem('userName') || 'User';
}

function getUserId() {
    return localStorage.getItem('userId') || 'unknown';
}

function normalizeStatus(status) {
    return status === 'In Progress' ? 'Pending' : status;
}

// ---- Auth guard: redirect to login if not logged in ----
function requireAuth() {
    const role = getUserRole();
    if (!role) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;

    setupRoleUI();
    fetchReports();
    fetchStats();
    initSocket();

    const categorySelect = document.getElementById('filterCategory');
    const statusSelect = document.getElementById('filterStatus');
    const sortSelect = document.getElementById('sortReports');
    const clearBtn = document.getElementById('clearFilters');
    const searchQueryInput = document.getElementById('searchQuery');

    if (categorySelect) categorySelect.addEventListener('change', fetchReports);
    if (statusSelect) statusSelect.addEventListener('change', fetchReports);
    if (sortSelect) sortSelect.addEventListener('change', applyClientFiltersAndRender);
    if (clearBtn) clearBtn.addEventListener('click', clearDashboardFilters);
    if (searchQueryInput) searchQueryInput.addEventListener('input', applyClientFiltersAndRender);

    const toggleGuideBtn = document.getElementById('toggleGuide');
    if (toggleGuideBtn) {
        toggleGuideBtn.addEventListener('click', () => {
            const helpSection = document.getElementById('dashboardHelp');
            if (helpSection) {
                helpSection.classList.toggle('collapsed');
                const icon = toggleGuideBtn.querySelector('i');
                if (helpSection.classList.contains('collapsed')) {
                    icon.className = 'fas fa-question-circle';
                } else {
                    icon.className = 'fas fa-times-circle';
                }
            }
        });
    }
});

function clearDashboardFilters() {
    const categorySelect = document.getElementById('filterCategory');
    const statusSelect = document.getElementById('filterStatus');
    const sortSelect = document.getElementById('sortReports');
    const searchQueryInput = document.getElementById('searchQuery');

    if (categorySelect) categorySelect.value = '';
    if (statusSelect) statusSelect.value = '';
    if (sortSelect) sortSelect.value = 'newest';
    if (searchQueryInput) searchQueryInput.value = '';

    fetchReports();
}

function applyClientFiltersAndRender() {
    const sortSelect = document.getElementById('sortReports');
    const statusSelect = document.getElementById('filterStatus');
    const searchQueryInput = document.getElementById('searchQuery');

    const sortBy = sortSelect ? sortSelect.value : 'newest';
    const selectedStatus = statusSelect ? statusSelect.value : '';
    const query = searchQueryInput ? searchQueryInput.value.toLowerCase().trim() : '';

    let reports = [...currentServerReports];

    if (selectedStatus === 'sla-breached') {
        reports = reports.filter(r => window.getSLAStatus && window.getSLAStatus(r) === 'breached');
    } else if (selectedStatus === 'Pending') {
        reports = reports.filter(r => ['Pending', 'In Progress'].includes(r.status));
    } else if (selectedStatus) {
        reports = reports.filter(r => normalizeStatus(r.status) === selectedStatus);
    }

    if (query) {
        reports = reports.filter(r => 
            (r.title && r.title.toLowerCase().includes(query)) ||
            (r.description && r.description.toLowerCase().includes(query)) ||
            (r.address && r.address.toLowerCase().includes(query))
        );
    }

    updateResultsMeta(reports.length, currentServerReports.length);

    reports.sort((a, b) => {
        if (sortBy === 'oldest') {
            return new Date(a.createdAt) - new Date(b.createdAt);
        }

        if (sortBy === 'upvotes') {
            const aVotes = Array.isArray(a.upvotedBy) ? a.upvotedBy.length : 0;
            const bVotes = Array.isArray(b.upvotedBy) ? b.upvotedBy.length : 0;
            return bVotes - aVotes;
        }

        if (sortBy === 'sla') {
            const weight = (report) => {
                if (!window.getSLAStatus) return 0;
                const sla = window.getSLAStatus(report);
                if (sla === 'breached') return 3;
                if (sla === 'due-soon') return 2;
                return 1;
            };

            const diff = weight(b) - weight(a);
            if (diff !== 0) return diff;
            return new Date(b.createdAt) - new Date(a.createdAt);
        }

        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    renderReports(reports);
}

function updateResultsMeta(visibleCount, baseCount) {
    const meta = document.getElementById('resultsMeta');
    if (!meta) return;

    meta.innerHTML = `<i class="fas fa-list"></i> Showing <strong>${visibleCount}</strong> reports`;
}

// Socket Setup
let socketInitialized = false;
function initSocket() {
    if (socketInitialized) return;
    socketInitialized = true;

    if (typeof io !== 'function') {
        const dot = document.querySelector('.live-dot');
        if (dot) dot.classList.add('offline');
        const txt = document.getElementById('liveText');
        if (txt) txt.textContent = 'Offline';
        return;
    }

    const socket = io();
    
    socket.on("connect", () => {
        const dot = document.querySelector(".live-dot");
        if (dot) dot.classList.remove("offline");
        const txt = document.getElementById("liveText");
        if (txt) txt.textContent = "Live";
    });
    
    socket.on("disconnect", () => {
        const dot = document.querySelector(".live-dot");
        if (dot) dot.classList.add("offline");
        const txt = document.getElementById("liveText");
        if (txt) txt.textContent = "Offline";
    });
    
    socket.on("report:new", (report) => {
        fetchReports(); // Simpler logic for this demo config
        if (window.showToast) window.showToast("📍 New report: " + report.title, "info");
        fetchStats();
    });
    
    socket.on("report:updated", (report) => {
        fetchReports();
        if (window.showToast) window.showToast("🔄 Report #" + report.id + " \u2192 " + report.status, "success");
        fetchStats();
    });
    
    socket.on("report:deleted", ({ id }) => {
        fetchReports();
        if (window.showToast) window.showToast("🗑️ A report was removed", "warning");
        fetchStats();
    });
    
    socket.on("report:upvoted", ({ id, upvotes }) => {
        const countEl = document.getElementById('upvote-count-' + id);
        if (countEl) countEl.textContent = upvotes;
    });
}

/**
 * Setup UI elements based on user role
 */
function setupRoleUI() {
    const role = getUserRole();
    const name = getUserName();

    const welcomeLine = document.getElementById('welcomeLine');
    if (welcomeLine) {
        welcomeLine.textContent = `Welcome, ${name}. Here's a focused view of your community reports.`;
    }

    const roleActionTip = document.getElementById('roleActionTip');
    if (roleActionTip) {
        if (role === 'admin') {
            roleActionTip.textContent = 'As Admin, you can update statuses, delete incorrect reports, and access the audit trail.';
        } else if (role === 'inspector') {
            roleActionTip.textContent = 'As Inspector, move issues through Reported, Pending, and Resolved with proper notes.';
        } else {
            roleActionTip.textContent = 'As Citizen, monitor progress, upvote important issues, and submit new reports when needed.';
        }
    }
}

// Basic HTML escaper
function escapeHTML(str) {
    if (!str) return str;
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
}

// Fetch Reports
async function fetchReports() {
    const loader = document.getElementById('loader');
    const grid = document.getElementById('reportsGrid');
    if (!loader || !grid) return;
    
    loader.style.display = 'flex';
    grid.innerHTML = '';

    const category = document.getElementById('filterCategory').value;
    const status = document.getElementById('filterStatus').value;
    
    let url = API_URL;
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (status && status !== 'sla-breached' && status !== 'Pending') params.append('status', status);
    if (params.toString()) url += `?${params.toString()}`;

    try {
        const response = await fetch(url, {
            headers: {
                'x-user-role': getUserRole(),
                'x-user-id': getUserId(),
                'x-user-name': getUserName()
            }
        });
        const data = await response.json();
        
        if (response.ok) {
            const records = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
            currentServerReports = records.map(normalizeReport);
            applyClientFiltersAndRender();
        } else {
            console.error('Error fetching data:', data.error);
            grid.innerHTML = `<div class="message error"><i class="fas fa-exclamation-triangle"></i> Failed to load reports.</div>`;
            updateResultsMeta(0, 0, '');
        }
    } catch (error) {
        console.error('Fetch error:', error);
        grid.innerHTML = `<div class="message error"><i class="fas fa-wifi"></i> Network error. Ensure backend is running.</div>`;
        updateResultsMeta(0, 0, '');
    } finally {
        loader.style.display = 'none';
    }
}

function renderReports(reports) {
    const grid = document.getElementById('reportsGrid');
    const role = getUserRole();

    if (!reports || reports.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 4rem; background: var(--bg-white); border-radius: var(--radius-lg); border: 1px dashed var(--border);">
                <i class="fas fa-inbox" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 1rem;"></i>
                <h3 style="color: var(--text-dark);">No reports found</h3>
                <p style="color: var(--text-muted); margin-bottom: 1rem;">Try adjusting your filters or checking back later.</p>
                <div style="display:flex; gap:0.75rem; justify-content:center; flex-wrap:wrap;">
                    <button id="emptyClearFilters" class="dashboard-clear-btn" type="button">
                        <i class="fas fa-rotate-left"></i> Reset Filters
                    </button>
                    <a href="report.html" class="btn btn-primary" style="text-decoration:none; display:inline-flex; align-items:center; gap:0.4rem;">
                        <i class="fas fa-plus-circle"></i> Report New Issue
                    </a>
                </div>
            </div>`;

        const resetBtn = document.getElementById('emptyClearFilters');
        if (resetBtn) {
            resetBtn.addEventListener('click', clearDashboardFilters);
        }

        return;
    }

    const upvotedLocal = JSON.parse(localStorage.getItem("upvoted_reports") || "[]");

    reports.forEach(report => {
        const displayStatus = normalizeStatus(report.status);
        const card = document.createElement('div');
        card.className = 'report-card';
        card.id = `report-card-${report.id}`;
        
        const PLACEHOLDER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200'%3E%3Crect width='400' height='200' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%2394a3b8'%3ENo Image Provided%3C/text%3E%3C/svg%3E`;
        const imageUrl = report.image_url || PLACEHOLDER;

        const dateStr = new Date(getReportDate(report)).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

        let badgeClass = 'badge-warning';
        if (displayStatus === 'Pending') badgeClass = 'badge-info';
        if (displayStatus === 'Resolved') badgeClass = 'badge-success';

        let slaHTML = '';
        if (window.getSLAStatus) {
            const slaStatus = window.getSLAStatus(report);
            const slaText = window.getSLADeadlineText(report);
            if (slaStatus === 'breached') {
                slaHTML = `<div style="margin-bottom: 1rem;"><span class="badge-sla-breached">⚠ SLA BREACHED</span><div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">${slaText}</div></div>`;
            } else if (slaStatus === 'due-soon') {
                slaHTML = `<div style="margin-bottom: 1rem;"><span class="badge-sla-due-soon">⏰ Due Soon</span><div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">${slaText}</div></div>`;
            } else {
                slaHTML = `<div style="margin-bottom: 1rem;"><div style="font-size: 0.75rem; color: var(--text-muted);">${slaText}</div></div>`;
            }
        }

        let statusSelectHTML = '';
        let deleteButtonHTML = '';

        const dbUpvotedCount = Array.isArray(report.upvotedBy) ? report.upvotedBy.length : 0;
        const isUpvoted = upvotedLocal.includes(report.id.toString());
        const upvoteClass = isUpvoted ? 'voted' : '';

        // Status update options: admin and inspector only
        if (role === 'admin' || role === 'inspector') {
            statusSelectHTML = `
                <div class="status-select-wrapper">
                    <select class="update-status" data-id="${report.id}">
                        <option value="Reported" ${report.status === 'Reported' ? 'selected' : ''}>Reported</option>
                        <option value="Pending" ${displayStatus === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option value="Resolved" ${displayStatus === 'Resolved' ? 'selected' : ''}>Resolved</option>
                    </select>
                </div>
            `;
        } else {
            statusSelectHTML = `
                <div class="status-read-only">
                    <span class="badge ${badgeClass}">${displayStatus}</span>
                </div>
            `;
        }

        // Delete: admin, inspector, or any user if Resolved
        if (role === 'admin' || role === 'inspector' || displayStatus === 'Resolved') {
            deleteButtonHTML = `
                <button class="btn-small btn-delete" data-id="${report.id}" title="Delete Report">
                    <i class="fas fa-trash-alt"></i> Delete
                </button>
            `;
        }

        card.innerHTML = `
            <div class="report-img-wrapper">
                <img src="${imageUrl}" alt="Report" class="report-img" onerror="this.onerror=null;this.src='${PLACEHOLDER}'">
                <div class="badge-position">
                    <span class="badge ${badgeClass}">${displayStatus}</span>
                </div>
            </div>
            <div class="report-content">
                <div class="report-title">${escapeHTML(report.title)}</div>
                
                <div class="report-meta">
                    <div class="report-meta-item"><i class="fas fa-map-marker-alt"></i> ${escapeHTML(report.address) || 'Location'}</div>
                    <div class="report-meta-item"><i class="far fa-calendar-alt"></i> ${dateStr}</div>
                    <div class="report-meta-item"><i class="fas fa-tag"></i> ${escapeHTML(report.category)}</div>
                </div>
                
                ${slaHTML}

                <div class="report-desc">
                    ${escapeHTML(report.description) || '<i>No description</i>'}
                </div>
                
                ${report.solution ? `
                <div class="report-solution">
                    <strong><i class="fas fa-check-circle"></i> Resolution:</strong> ${escapeHTML(report.solution)}
                </div>` : ''}
                
                <div class="report-actions">
                    <button class="btn-upvote ${upvoteClass}" data-id="${report.id}">
                        <i class="fas fa-arrow-up"></i>
                        <span id="upvote-count-${report.id}">${dbUpvotedCount}</span>
                    </button>
                    ${statusSelectHTML}
                    ${deleteButtonHTML}
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    // Event listeners
    document.querySelectorAll('.update-status').forEach(select => {
        select.addEventListener('change', async (e) => {
            const reportId = e.target.getAttribute('data-id');
            const newStatus = e.target.value;
            let solution = undefined;
            if (newStatus === 'Resolved') {
                solution = prompt('Please describe how this issue was resolved (or leave blank):');
                if (solution === null) {
                    fetchReports();
                    return;
                }
            }
            e.target.disabled = true;
            await updateStatus(reportId, newStatus, solution);
        });
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const targetBtn = e.target.closest('button');
            const reportId = targetBtn.getAttribute('data-id');
            if (confirm('Permanently delete this report?')) {
                const card = targetBtn.closest('.report-card');
                card.style.opacity = '0.5';
                await deleteReport(reportId);
            }
        });
    });

    // Upvote
    document.querySelectorAll('.btn-upvote').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const targetBtn = e.target.closest('button');
            const reportId = targetBtn.getAttribute('data-id');
            await handleUpvote(reportId, targetBtn);
        });
    });
}

async function handleUpvote(id, btnElement) {
    let upvotedLocal = JSON.parse(localStorage.getItem("upvoted_reports") || "[]");
    
    if (upvotedLocal.includes(id.toString())) {
        if (window.showToast) window.showToast("Already upvoted!", "warning");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/${id}/upvote`, {
            method: 'PATCH',
            headers: { 'x-user-id': getUserId() }
        });
        
        if (!response.ok) {
            if (window.showToast) window.showToast('Failed to upvote report.', 'error');
            return;
        }

        const data = await response.json();
        
        upvotedLocal.push(id.toString());
        localStorage.setItem("upvoted_reports", JSON.stringify(upvotedLocal));

        btnElement.classList.add('voted');
        if (window.showToast) window.showToast("✅ Upvoted!", "success");

        const countSpan = document.getElementById(`upvote-count-${id}`);
        if (countSpan) countSpan.textContent = data.upvotes;
        
    } catch (err) {
        if (window.showToast) window.showToast('Network error while upvoting.', 'error');
    }
}

async function deleteReport(id) {
    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE',
            headers: {
                'x-user-role': getUserRole(),
                'x-user-id': getUserId(),
                'x-user-name': getUserName()
            }
        });
        if (!response.ok) {
            const data = await response.json();
            if (window.showToast) window.showToast(data.error || 'Failed to delete report.', 'error');
        }
    } catch (err) {
        if (window.showToast) window.showToast('Network error while deleting.', 'error');
    }
}

async function updateStatus(id, newStatus, solution) {
    try {
        const payload = { status: newStatus };
        if (solution !== undefined) payload.solution = solution;

        const response = await fetch(`${API_URL}/${id}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'x-user-role': getUserRole(),
                'x-user-id': getUserId(),
                'x-user-name': getUserName()
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const data = await response.json();
            if (window.showToast) window.showToast(data.error || 'Failed to update.', 'error');
        }
    } catch (err) {
        if (window.showToast) window.showToast('Network error while updating.', 'error');
    }
}

async function fetchStats() {
    try {
        const response = await fetch(`${API_URL}/stats`);
        const data = await response.json();
        if (response.ok) {
            renderStats(Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : []);
        }
    } catch (error) {
        console.error('Stats error:', error);
    }
}

function renderStats(statsArray) {
    const container = document.getElementById('statsContainer');
    if (!container) return;

    const statsMap = statsArray.reduce((acc, curr) => {
        acc[curr.status] = curr.count;
        return acc;
    }, {});

    const total = statsArray.reduce((sum, curr) => sum + Number(curr.count || 0), 0);
    const resolved = statsMap['Resolved'] || 0;
    const pending = (statsMap['Pending'] || 0) + (statsMap['In Progress'] || 0);

    const currentStatus = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : '';

    container.innerHTML = `
        <div class="stat-card ${!currentStatus ? 'active' : ''}" data-filter="">
            <div class="stat-icon total"><i class="fas fa-list"></i></div>
            <div class="stat-details">
                <h3>${total}</h3>
                <p>Total Reports</p>
            </div>
        </div>
        <div class="stat-card ${currentStatus === 'Resolved' ? 'active' : ''}" data-filter="Resolved">
            <div class="stat-icon resolved"><i class="fas fa-check-circle"></i></div>
            <div class="stat-details">
                <h3 style="color: var(--success);">${resolved}</h3>
                <p>Issues Resolved</p>
            </div>
        </div>
        <div class="stat-card ${currentStatus === 'Pending' ? 'active' : ''}" data-filter="Pending">
            <div class="stat-icon progress"><i class="fas fa-clock"></i></div>
            <div class="stat-details">
                <h3 style="color: var(--primary);">${pending}</h3>
                <p>Pending Issues</p>
            </div>
        </div>
    `;

    // Add click listeners for interactive filtering
    container.querySelectorAll('.stat-card').forEach(card => {
        card.addEventListener('click', () => {
            const statusSelect = document.getElementById('filterStatus');
            if (statusSelect) {
                statusSelect.value = card.getAttribute('data-filter');
                statusSelect.dispatchEvent(new Event('change'));
            }
        });
    });
}
