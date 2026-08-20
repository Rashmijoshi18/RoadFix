/**
 * RoadFix — Citizen Dashboard v2
 * Uses JWT cookie auth via api.js — no more localStorage x-user-* headers.
 */

'use strict';

let currentUser = null;
let allReports = [];
let socket = null;

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Require citizen (or any role — dashboard will filter to their data)
    currentUser = await Session.require();
    if (!currentUser) return; // redirected to login

    setupNavbar();
    setupSidebar();
    await Promise.all([fetchReports(), fetchStats(), fetchRewards(), fetchNotifications()]);
    initSocket();
    setupFilters();
    setupNotificationPanel();
});

// ─── Navbar ───────────────────────────────────────────────────────────────────
function setupNavbar() {
    const info = document.getElementById('navUserInfo');
    if (info) {
        info.innerHTML = `
            <span style="font-size:0.85rem; color: var(--text-muted); font-weight: 600;">${escapeHTML(currentUser.name)}</span>
            <button class="btn-logout" id="navLogoutBtn" title="Sign out" aria-label="Sign out">
                <i class="fas fa-sign-out-alt"></i>
            </button>
        `;
        document.getElementById('navLogoutBtn')?.addEventListener('click', () => Auth.logout());
    }

    const welcomeLine = document.getElementById('welcomeLine');
    if (welcomeLine) {
        welcomeLine.textContent = `Welcome back, ${currentUser.name} — here are your submitted reports.`;
    }
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function setupSidebar() {
    const avatarEl = document.getElementById('sidebarAvatar');
    const nameEl   = document.getElementById('sidebarName');
    const roleEl   = document.getElementById('sidebarRole');

    if (avatarEl) avatarEl.textContent = (currentUser.name || 'U')[0].toUpperCase();
    if (nameEl)   nameEl.textContent = currentUser.name;
    if (roleEl) {
        roleEl.textContent = formatRole(currentUser.role);
    }

    document.getElementById('logoutSidebarBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        Auth.logout();
    });
}

// ─── Filters ──────────────────────────────────────────────────────────────────
function setupFilters() {
    const statusSel   = document.getElementById('filterStatus');
    const categorySel = document.getElementById('filterCategory');
    const sortSel     = document.getElementById('sortReports');
    const searchInput = document.getElementById('searchQuery');
    const clearBtn    = document.getElementById('clearFilters');

    statusSel?.addEventListener('change', () => { fetchReports(); });
    categorySel?.addEventListener('change', fetchReports);
    sortSel?.addEventListener('change', applyClientFiltersAndRender);
    searchInput?.addEventListener('input', applyClientFiltersAndRender);
    clearBtn?.addEventListener('click', clearFilters);
}

function clearFilters() {
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterCategory').value = '';
    document.getElementById('sortReports').value = 'newest';
    document.getElementById('searchQuery').value = '';
    fetchReports();
}

// ─── Fetch Reports ────────────────────────────────────────────────────────────
async function fetchReports() {
    showSkeletonCards();

    const category = document.getElementById('filterCategory')?.value || '';
    const status   = document.getElementById('filterStatus')?.value || '';

    const params = {};
    if (category) params.category = category;
    if (status && status !== 'sla-breached') params.status = status;

    try {
        const data = await api.get('/reports', params);
        allReports = (data?.data || []).map(normalizeReport);
        applyClientFiltersAndRender();
    } catch (err) {
        showError('Failed to load your reports. ' + (err.message || ''));
    }
}

// ─── Fetch Stats ──────────────────────────────────────────────────────────────
async function fetchStats() {
    try {
        const data = await api.get('/reports/stats');
        renderStats(data?.data || {});
    } catch {
        // non-critical — fail silently
    }
}

// ─── Fetch Rewards ────────────────────────────────────────────────────────────
async function fetchRewards() {
    if (currentUser.role !== 'citizen') return;
    try {
        const data = await api.get('/rewards/me');
        renderRewards(data?.data);
    } catch {
        // non-critical
    }
}

// ─── Fetch Notifications ─────────────────────────────────────────────────────
async function fetchNotifications() {
    try {
        const data = await api.get('/notifications');
        renderNotifications(data?.data || [], data?.unreadCount || 0);
    } catch {
        // non-critical
    }
}

// ─── Client Filters + Render ──────────────────────────────────────────────────
function applyClientFiltersAndRender() {
    const sortBy  = document.getElementById('sortReports')?.value || 'newest';
    const status  = document.getElementById('filterStatus')?.value || '';
    const query   = (document.getElementById('searchQuery')?.value || '').toLowerCase().trim();

    let reports = [...allReports];

    if (status === 'sla-breached') {
        reports = reports.filter(r => window.getSLAStatus && window.getSLAStatus(r) === 'breached');
    } else if (status) {
        reports = reports.filter(r => r.status === status);
    }

    if (query) {
        reports = reports.filter(r =>
            (r.title || '').toLowerCase().includes(query) ||
            (r.description || '').toLowerCase().includes(query) ||
            (r.address || '').toLowerCase().includes(query)
        );
    }

    reports.sort((a, b) => {
        if (sortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
        if (sortBy === 'upvotes') {
            return (b.upvotedBy?.length || 0) - (a.upvotedBy?.length || 0);
        }
        if (sortBy === 'sla' && window.getSLAStatus) {
            const w = r => ({ breached: 3, 'due-soon': 2 }[window.getSLAStatus(r)] || 1);
            return w(b) - w(a) || new Date(b.createdAt) - new Date(a.createdAt);
        }
        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const meta = document.getElementById('resultsMeta');
    if (meta) {
        meta.innerHTML = reports.length > 0
            ? `<i class="fas fa-list"></i> Showing <strong>${reports.length}</strong> of ${allReports.length} reports`
            : '';
    }

    renderReports(reports);
}

// ─── Render Stats ─────────────────────────────────────────────────────────────
function renderStats({ statusStats = [], categoryStats = [] }) {
    const grid = document.getElementById('statsGrid');
    if (!grid) return;

    const statusMap = {};
    statusStats.forEach(s => { statusMap[s.status] = s.count; });

    const total    = statusStats.reduce((sum, s) => sum + (s.count || 0), 0);
    const reported = statusMap['Reported'] || 0;
    const inProg   = (statusMap['In Progress'] || 0) + (statusMap['Assigned'] || 0) + (statusMap['Verified'] || 0);
    const resolved = (statusMap['Completed'] || 0) + (statusMap['Closed'] || 0);

    grid.innerHTML = `
        <div class="stat-card-v2 total" data-filter="" title="View all reports">
            <div class="stat-icon-v2 total"><i class="fas fa-layer-group"></i></div>
            <div class="stat-number">${total}</div>
            <div class="stat-label">Total Reports</div>
        </div>
        <div class="stat-card-v2 reported" data-filter="Reported" title="Filter: Reported">
            <div class="stat-icon-v2 reported"><i class="fas fa-flag"></i></div>
            <div class="stat-number">${reported}</div>
            <div class="stat-label">Reported</div>
        </div>
        <div class="stat-card-v2 progress" data-filter="In Progress" title="Filter: In Progress">
            <div class="stat-icon-v2 progress"><i class="fas fa-spinner"></i></div>
            <div class="stat-number">${inProg}</div>
            <div class="stat-label">In Progress</div>
        </div>
        <div class="stat-card-v2 resolved" data-filter="Completed" title="Filter: Completed">
            <div class="stat-icon-v2 resolved"><i class="fas fa-check-circle"></i></div>
            <div class="stat-number">${resolved}</div>
            <div class="stat-label">Resolved</div>
        </div>
    `;

    grid.querySelectorAll('.stat-card-v2').forEach(card => {
        card.addEventListener('click', () => {
            const statusSel = document.getElementById('filterStatus');
            if (statusSel) {
                statusSel.value = card.dataset.filter;
                fetchReports();
            }
        });
    });
}

// ─── Render Rewards ───────────────────────────────────────────────────────────
function renderRewards(data) {
    if (!data) return;
    const widget = document.getElementById('rewardsWidget');
    if (!widget) return;

    const levelIcons = { Bronze: '🥉', Silver: '🥈', Gold: '🥇', Platinum: '💎' };
    document.getElementById('rewardsIcon').textContent   = levelIcons[data.level?.name] || '🥉';
    document.getElementById('rewardsLevel').textContent  = data.level?.name || 'Bronze';
    document.getElementById('rewardsPoints').textContent = `${data.points || 0} pts`;
    document.getElementById('rewardsProgressFill').style.width = `${data.progress || 0}%`;

    if (data.nextLevel) {
        document.getElementById('rewardsNextLabel').textContent = `Next: ${data.nextLevel.name} at ${data.nextLevel.min} pts`;
    } else {
        document.getElementById('rewardsNextLabel').textContent = 'Max level reached! 🏆';
    }

    widget.style.display = 'flex';
}

// ─── Render Reports ───────────────────────────────────────────────────────────
function renderReports(reports) {
    const grid = document.getElementById('reportsGrid');
    if (!grid) return;

    if (!reports || reports.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="fas fa-inbox"></i></div>
                <div class="empty-title">No reports found</div>
                <div class="empty-sub">Try adjusting your filters or submit a new complaint.</div>
                <div class="empty-actions">
                    <button class="btn btn-outline" onclick="clearFilters()">
                        <i class="fas fa-rotate-left"></i> Reset Filters
                    </button>
                    <a href="report.html" class="btn btn-primary">
                        <i class="fas fa-plus-circle"></i> New Report
                    </a>
                </div>
            </div>`;
        return;
    }

    const upvotedLocal = new Set(JSON.parse(localStorage.getItem('upvoted_reports') || '[]'));

    grid.innerHTML = '';
    reports.forEach(report => {
        const card = createReportCard(report, upvotedLocal);
        grid.appendChild(card);
    });

    // Attach event listeners
    grid.querySelectorAll('.btn-upvote-v2').forEach(btn => {
        btn.addEventListener('click', () => handleUpvote(btn.dataset.id, btn));
    });
    grid.querySelectorAll('.timeline-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const timeline = btn.nextElementSibling;
            timeline?.classList.toggle('open');
            const icon = btn.querySelector('i');
            icon.className = timeline?.classList.contains('open')
                ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
        });
    });
}

function createReportCard(report, upvotedLocal) {
    const card = document.createElement('div');
    card.className = 'report-card-v2';
    card.id = `report-card-${report.id}`;

    const statusClass = {
        'Reported': 'tag-reported', 'Verified': 'tag-verified', 'Assigned': 'tag-assigned',
        'In Progress': 'tag-inprogress', 'Completed': 'tag-completed', 'Closed': 'tag-closed'
    }[report.status] || 'tag-reported';

    const priorityClass = {
        'Low': 'priority-low', 'Medium': 'priority-medium',
        'High': 'priority-high', 'Critical': 'priority-critical'
    }[report.priority] || 'priority-medium';

    const dateStr = new Date(report.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const upvotes = Array.isArray(report.upvotedBy) ? report.upvotedBy.length : 0;
    const isUpvoted = upvotedLocal.has(report.id?.toString());

    // SLA
    let slaHTML = '';
    if (window.getSLAStatus && !['Completed', 'Closed'].includes(report.status)) {
        const sla = window.getSLAStatus(report);
        const slaText = window.getSLADeadlineText(report);
        const slaClass = sla === 'breached' ? 'sla-breached' : sla === 'due-soon' ? 'sla-due-soon' : 'sla-ok';
        const slaIcon = sla === 'breached' ? '⚠' : sla === 'due-soon' ? '⏰' : '✓';
        slaHTML = `<span class="sla-badge ${slaClass}">${slaIcon} ${slaText}</span>`;
    }

    // Timeline
    let timelineHTML = '';
    if (Array.isArray(report.statusTimeline) && report.statusTimeline.length > 0) {
        timelineHTML = `
            <button class="timeline-toggle">
                <i class="fas fa-chevron-down"></i> View Timeline (${report.statusTimeline.length} steps)
            </button>
            <div class="timeline">
                ${report.statusTimeline.map(step => `
                    <div class="timeline-step">
                        <div class="timeline-dot done"></div>
                        <div class="timeline-content">
                            <div class="timeline-status">${escapeHTML(step.status)}</div>
                            <div class="timeline-meta">by ${escapeHTML(step.changedBy)} · ${new Date(step.changedAt).toLocaleDateString()}</div>
                            ${step.note ? `<div class="timeline-note">${escapeHTML(step.note)}</div>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>`;
    }

    // Image
    const imgHTML = report.image_url
        ? `<img src="${escapeHTML(report.image_url)}" alt="Report photo" class="report-card-img" loading="lazy" onerror="this.parentElement.innerHTML='<div class=report-card-img-placeholder><i class=fas fa-image></i></div>'">`
        : `<div class="report-card-img-placeholder"><i class="fas fa-image"></i></div>`;

    card.innerHTML = `
        ${imgHTML}
        <div class="report-card-body">
            <div class="report-card-tags">
                <span class="tag ${statusClass}">${escapeHTML(report.status)}</span>
                <span class="tag tag-category"><i class="fas fa-tag"></i> ${escapeHTML(report.category)}</span>
                ${slaHTML}
            </div>
            <div class="report-card-title">
                <span class="priority-dot ${priorityClass}"></span>${escapeHTML(report.title)}
            </div>
            <div class="report-card-meta">
                <span><i class="fas fa-map-marker-alt"></i>${escapeHTML(report.address || 'Location not set')}</span>
                <span><i class="far fa-calendar"></i>${dateStr}</span>
            </div>
            <div class="report-card-desc">${escapeHTML(report.description) || '<em>No description provided.</em>'}</div>
            ${report.solution ? `
                <div style="background: rgba(16,185,129,0.08); border-left: 3px solid #10b981; padding: 0.6rem 0.8rem; border-radius: 6px; margin-bottom: 0.75rem; font-size: 0.82rem; color: #059669;">
                    <strong><i class="fas fa-check"></i> Resolution:</strong> ${escapeHTML(report.solution)}
                </div>` : ''}
            ${timelineHTML}
        </div>
        <div class="report-card-footer">
            <button class="btn-upvote-v2 ${isUpvoted ? 'voted' : ''}" data-id="${report.id}" title="Upvote this report">
                <i class="fas fa-arrow-up"></i>
                <span id="upvote-count-${report.id}">${upvotes}</span>
            </button>
            <span style="margin-left: auto; font-size: 0.75rem; color: var(--text-muted);">
                <i class="fas fa-hashtag" style="font-size: 0.65rem;"></i>${escapeHTML(report.id?.slice(-8) || '')}
            </span>
        </div>
    `;

    return card;
}

// ─── Notifications Panel ──────────────────────────────────────────────────────
function setupNotificationPanel() {
    const btn   = document.getElementById('notifBtn');
    const panel = document.getElementById('notifPanel');
    const markAllBtn = document.getElementById('markAllRead');

    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        panel?.classList.toggle('open');
    });

    markAllBtn?.addEventListener('click', async () => {
        try {
            await api.patch('/notifications/read-all', {});
            document.querySelectorAll('.notif-item').forEach(el => el.classList.remove('unread'));
            const badge = document.getElementById('notifBadge');
            if (badge) badge.style.display = 'none';
        } catch { }
    });

    document.addEventListener('click', (e) => {
        if (!document.getElementById('notifWrap')?.contains(e.target)) {
            panel?.classList.remove('open');
        }
    });
}

function renderNotifications(notifs, unreadCount) {
    const list  = document.getElementById('notifList');
    const badge = document.getElementById('notifBadge');

    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    if (!list) return;

    if (!notifs.length) {
        list.innerHTML = '<div class="notif-empty"><i class="fas fa-bell-slash"></i><br>No notifications yet</div>';
        return;
    }

    list.innerHTML = notifs.slice(0, 20).map(n => `
        <div class="notif-item ${!n.isRead ? 'unread' : ''}" data-id="${n._id || ''}">
            <div class="notif-item-title">${escapeHTML(n.title)}</div>
            <div class="notif-item-body">${escapeHTML(n.body)}</div>
            <div class="notif-item-time">${timeAgo(n.createdAt)}</div>
        </div>
    `).join('');
}

// ─── Socket.IO ────────────────────────────────────────────────────────────────
function initSocket() {
    if (typeof io !== 'function') return;

    socket = io();

    socket.on('connect', () => {
        const dot  = document.getElementById('liveDot');
        const text = document.getElementById('liveText');
        if (dot)  { dot.classList.remove('offline'); }
        if (text) text.textContent = 'Live';

        // Join personal room for targeted notifications
        socket.emit('join:user', currentUser.id);
        socket.emit('join:role', currentUser.role);
    });

    socket.on('disconnect', () => {
        const dot  = document.getElementById('liveDot');
        const text = document.getElementById('liveText');
        if (dot)  dot.classList.add('offline');
        if (text) text.textContent = 'Offline';
    });

    socket.on('report:new', (report) => {
        if (report.reportedBy?.userId === currentUser.id) {
            fetchReports();
            fetchStats();
        }
        if (window.showToast) window.showToast(`📍 New report: ${report.title}`, 'info');
    });

    socket.on('report:updated', (report) => {
        // Update in-place without full re-fetch
        const idx = allReports.findIndex(r => r.id === report.id);
        if (idx !== -1) {
            allReports[idx] = normalizeReport(report);
            applyClientFiltersAndRender();
        }
        if (window.showToast) window.showToast(`🔄 Report status updated → ${report.status}`, 'success');
        fetchStats();
    });

    socket.on('report:upvoted', ({ id, upvotes }) => {
        const countEl = document.getElementById(`upvote-count-${id}`);
        if (countEl) countEl.textContent = upvotes;
    });

    socket.on('notification:new', (notif) => {
        fetchNotifications();
        if (window.showToast) window.showToast(`🔔 ${notif.title || 'New notification'}`, 'info');
    });
}

// ─── Upvote ───────────────────────────────────────────────────────────────────
async function handleUpvote(id, btn) {
    const upvotedLocal = new Set(JSON.parse(localStorage.getItem('upvoted_reports') || '[]'));

    try {
        const data = await api.patch(`/reports/${id}/upvote`, {});
        const countEl = document.getElementById(`upvote-count-${id}`);
        if (countEl) countEl.textContent = data.upvotes;

        if (data.isUpvoted) {
            upvotedLocal.add(id.toString());
            btn.classList.add('voted');
            if (window.showToast) window.showToast('✅ Upvoted!', 'success');
        } else {
            upvotedLocal.delete(id.toString());
            btn.classList.remove('voted');
        }

        localStorage.setItem('upvoted_reports', JSON.stringify([...upvotedLocal]));
    } catch (err) {
        if (window.showToast) window.showToast(err.message || 'Upvote failed.', 'error');
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizeReport(r) {
    return { ...r, id: r.id ?? r._id, createdAt: r.createdAt || r.created_at || new Date().toISOString() };
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"/]/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '/': '&#x2F;'
    }[c]));
}

function formatRole(role) {
    return {
        citizen: 'Citizen',
        municipal_officer: 'Municipal Officer',
        inspector: 'Inspector',
        zone_manager: 'Zone Manager',
        super_admin: 'Super Admin',
        admin: 'Admin'
    }[role] || role;
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = (Date.now() - new Date(dateStr)) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function showSkeletonCards() {
    const grid = document.getElementById('reportsGrid');
    if (!grid) return;
    grid.innerHTML = Array(3).fill(`
        <div class="skeleton-card">
            <div class="skeleton skeleton-img"></div>
            <div class="skeleton-body">
                <div class="skeleton skeleton-title w80"></div>
                <div class="skeleton skeleton-line w60"></div>
                <div class="skeleton skeleton-line w40"></div>
            </div>
        </div>`).join('');
}

function showError(msg) {
    const grid = document.getElementById('reportsGrid');
    if (grid) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon" style="color: #ef4444;"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="empty-title">Could Not Load Reports</div>
                <div class="empty-sub">${escapeHTML(msg)}</div>
                <div class="empty-actions">
                    <button class="btn btn-primary" onclick="fetchReports()">
                        <i class="fas fa-refresh"></i> Try Again
                    </button>
                </div>
            </div>`;
    }
}
