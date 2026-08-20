/**
 * RoadFix — Report Form Logic v2
 * Uses JWT cookie auth via api.js.
 * New: AI image verification, duplicate detection, severity selection.
 */

'use strict';

let map, marker;
let currentUser = null;
let aiAnalysisResult = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Auth guard
    currentUser = await Session.require();
    if (!currentUser) return;

    setupNavbar();

    const mapEl = document.getElementById('map');
    if (mapEl) initMap();

    const form = document.getElementById('reportForm');
    if (form) form.addEventListener('submit', handleFormSubmit);

    const imageInput = document.getElementById('image');
    if (imageInput) {
        imageInput.addEventListener('change', handleImageChange);
    }
});

// ─── Navbar ───────────────────────────────────────────────────────────────────
function setupNavbar() {
    const info = document.getElementById('navUserInfo');
    if (info) {
        info.innerHTML = `
            <span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">${currentUser.name}</span>
            <button class="btn-logout" id="logoutBtn" title="Sign out"><i class="fas fa-sign-out-alt"></i></button>
        `;
        document.getElementById('logoutBtn')?.addEventListener('click', () => Auth.logout());
    }
}

// ─── Map ──────────────────────────────────────────────────────────────────────
function initMap() {
    const defaultCoords = [20.5937, 78.9629]; // India center

    map = L.map('map').setView(defaultCoords, 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    marker = L.marker(defaultCoords, { draggable: true }).addTo(map);
    updateCoordInputs(defaultCoords[0], defaultCoords[1]);

    map.on('click', (e) => {
        marker.setLatLng([e.latlng.lat, e.latlng.lng]);
        updateCoordInputs(e.latlng.lat, e.latlng.lng);
    });

    marker.on('dragend', () => {
        const pos = marker.getLatLng();
        updateCoordInputs(pos.lat, pos.lng);
    });

    // Try geolocation
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const coords = [pos.coords.latitude, pos.coords.longitude];
                map.setView(coords, 15);
                marker.setLatLng(coords);
                updateCoordInputs(coords[0], coords[1]);
            },
            () => { /* Denied — use default */ }
        );
    }

    window.addEventListener('resize', () => map?.invalidateSize());
}

function updateCoordInputs(lat, lng) {
    const latEl = document.getElementById('latitude');
    const lngEl = document.getElementById('longitude');
    if (latEl) latEl.value = lat;
    if (lngEl) lngEl.value = lng;
}

// ─── Image Handling + AI Analysis ────────────────────────────────────────────
async function handleImageChange() {
    const fileInput  = document.getElementById('image');
    const preview    = document.getElementById('imagePreview');
    const prompt     = document.getElementById('uploadPrompt');
    const aiPanel    = document.getElementById('aiPanel');

    const file = fileInput?.files?.[0];

    if (!file) {
        if (preview)  { preview.src = ''; preview.style.display = 'none'; }
        if (prompt)   prompt.style.display = 'block';
        if (aiPanel)  aiPanel.innerHTML = '';
        aiAnalysisResult = null;
        return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        if (preview)  { preview.src = e.target.result; preview.style.display = 'block'; }
        if (prompt)   prompt.style.display = 'none';
    };
    reader.readAsDataURL(file);

    // AI analysis
    if (aiPanel) {
        aiPanel.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.6rem; padding:0.75rem; background:rgba(37,99,235,0.06); border-radius:10px; font-size:0.85rem; color:var(--primary);">
                <i class="fas fa-spinner fa-spin"></i> AI is analyzing your image...
            </div>`;

        try {
            // Convert to base64 for API
            const base64 = await fileToBase64(file);
            const imageBase64 = base64.split(',')[1]; // Remove data URL prefix

            const result = await api.post('/ai/verify-image', {
                imageBase64,
                mimeType: file.type
            });

            aiAnalysisResult = result?.data;
            renderAIPanel(aiPanel, aiAnalysisResult);

            // Auto-fill category and severity if AI detected them
            if (aiAnalysisResult?.category) {
                const catEl = document.getElementById('category');
                if (catEl && catEl.value === '') catEl.value = aiAnalysisResult.category;
            }
            if (aiAnalysisResult?.severity) {
                const sevEl = document.getElementById('severity');
                if (sevEl) sevEl.value = aiAnalysisResult.severity;
            }
        } catch (err) {
            aiPanel.innerHTML = `
                <div style="padding:0.75rem; background:rgba(245,158,11,0.08); border-radius:10px; font-size:0.82rem; color:#d97706;">
                    <i class="fas fa-exclamation-triangle"></i> AI analysis unavailable. You can still submit manually.
                </div>`;
        }
    }
}

function renderAIPanel(panel, data) {
    if (!data) return;

    const isRoad = data.isRoadIssue !== false;
    const sev    = data.severity || 'Medium';
    const sevColors = { Low: '#10b981', Medium: '#f59e0b', High: '#f97316', Critical: '#ef4444' };
    const sevColor = sevColors[sev] || '#f59e0b';

    if (!isRoad && data.aiAvailable) {
        panel.innerHTML = `
            <div style="background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); border-radius: 10px; padding: 1rem;">
                <div style="display:flex; align-items:center; gap:0.6rem; font-weight:700; color:#dc2626; margin-bottom:0.5rem;">
                    <i class="fas fa-ban"></i> Image Rejected by AI
                </div>
                <p style="font-size:0.85rem; color:#7f1d1d; margin:0;">${data.rejectionReason || 'The uploaded image does not appear to show a road or infrastructure issue. Please upload a relevant photo.'}</p>
            </div>`;
        return;
    }

    panel.innerHTML = `
        <div style="background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.2); border-radius: 10px; padding: 1rem;">
            <div style="display:flex; align-items:center; gap:0.6rem; font-weight:700; color:#059669; margin-bottom:0.75rem;">
                <i class="fas fa-robot"></i> AI Analysis ${data.aiAvailable ? `(${data.confidence || 0}% confidence)` : '(offline)'}
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:0.75rem; font-size:0.82rem;">
                ${data.category ? `
                    <div style="background:var(--bg-page); border:1px solid var(--border); border-radius:8px; padding:0.4rem 0.7rem;">
                        <strong>Category:</strong> ${data.category}
                    </div>` : ''}
                <div style="background:var(--bg-page); border:1px solid var(--border); border-radius:8px; padding:0.4rem 0.7rem; color:${sevColor}; border-color:${sevColor}40;">
                    <strong>Severity:</strong> ${sev}
                </div>
            </div>
            ${data.description ? `<p style="font-size:0.82rem; color:var(--text-muted); margin-top:0.6rem; margin-bottom:0;">${data.description}</p>` : ''}
        </div>`;
}

// ─── Duplicate Check ──────────────────────────────────────────────────────────
async function checkForDuplicates() {
    const lat   = document.getElementById('latitude')?.value;
    const lng   = document.getElementById('longitude')?.value;
    const title = document.getElementById('title')?.value;
    const desc  = document.getElementById('description')?.value;

    if (!lat || !lng) return;

    const dupPanel = document.getElementById('duplicatePanel');
    if (!dupPanel) return;

    try {
        const result = await api.post('/ai/check-duplicate', { latitude: lat, longitude: lng, title, description: desc });
        const { isDuplicate, similar } = result?.data || {};

        if (isDuplicate && similar?.length > 0) {
            const nearest = similar[0];
            dupPanel.innerHTML = `
                <div style="background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.3); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                    <div style="display:flex; align-items:center; gap:0.6rem; font-weight:700; color:#d97706; margin-bottom:0.6rem;">
                        <i class="fas fa-exclamation-triangle"></i> Possible Duplicate Detected
                    </div>
                    <p style="font-size:0.85rem; color:var(--text-dark); margin:0 0 0.75rem;">
                        A similar complaint already exists nearby:
                        <strong>"${nearest.title}"</strong> 
                        — ${nearest.distanceMeters}m away, status: <strong>${nearest.status}</strong>
                    </p>
                    <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
                        <button type="button" id="ignoreDuplicate" class="btn btn-outline btn-sm">
                            <i class="fas fa-plus"></i> Submit Anyway
                        </button>
                    </div>
                </div>`;

            document.getElementById('ignoreDuplicate')?.addEventListener('click', () => {
                dupPanel.innerHTML = '';
            });
        } else {
            dupPanel.innerHTML = '';
        }
    } catch {
        dupPanel.innerHTML = '';
    }
}

// ─── Form Submission ──────────────────────────────────────────────────────────
async function handleFormSubmit(e) {
    e.preventDefault();

    const form      = e.target;
    const submitBtn = document.getElementById('submitBtn');
    const msgBox    = document.getElementById('formMessage');

    // Check if AI rejected the image
    if (aiAnalysisResult?.aiAvailable && aiAnalysisResult?.isRoadIssue === false) {
        if (msgBox) {
            msgBox.className = 'message error';
            msgBox.textContent = 'Please upload a photo showing an actual road or infrastructure issue.';
            msgBox.style.display = 'block';
        }
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    if (msgBox) { msgBox.className = 'message hidden'; msgBox.style.display = 'none'; }

    // Run duplicate check before submitting
    await checkForDuplicates();

    // Check if duplicate warning was shown (user must click "Submit Anyway" to clear it)
    const dupPanel = document.getElementById('duplicatePanel');
    if (dupPanel && dupPanel.innerHTML.trim() !== '') {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Report';
        return;
    }

    try {
        const formData = new FormData(form);

        // Attach AI analysis if available
        if (aiAnalysisResult) {
            formData.set('aiAnalysis', JSON.stringify(aiAnalysisResult));
        }

        // Use fetch directly for FormData (multipart)
        const response = await fetch('/api/reports', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        const data = await response.json();

        if (response.ok && data.success) {
            const reportTitle = formData.get('title') || 'your issue';
            const reportId = data.data?.reportId;

            // Show success
            form.style.display = 'none';
            const banner = document.getElementById('successBanner');
            const detail = document.getElementById('successDetail');

            if (detail) {
                detail.innerHTML = `"<strong>${reportTitle}</strong>" logged with Tracking ID <strong>#${reportId?.slice(-8)}</strong>. Our team will review it shortly.`;
            }
            if (banner) {
                banner.classList.remove('hidden');
                banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            // Reset state
            aiAnalysisResult = null;
            const aiPanel = document.getElementById('aiPanel');
            if (aiPanel) aiPanel.innerHTML = '';

            if (window.showToast) window.showToast('✅ Report submitted successfully!', 'success');
        } else {
            throw new Error(data.error || 'Submission failed');
        }
    } catch (err) {
        if (msgBox) {
            msgBox.className = 'message error';
            msgBox.textContent = err.message || 'An error occurred. Please try again.';
            msgBox.style.display = 'block';
        }
        if (window.showToast) window.showToast(err.message || 'Submission failed.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Report';
    }
}

// ─── Reset form after success banner ─────────────────────────────────────────
window.resetToForm = function() {
    const banner = document.getElementById('successBanner');
    const form   = document.getElementById('reportForm');
    const preview = document.getElementById('imagePreview');
    const prompt  = document.getElementById('uploadPrompt');

    if (banner) banner.classList.add('hidden');
    if (form)   { form.style.display = ''; form.reset(); form.scrollIntoView({ behavior: 'smooth' }); }
    if (preview && prompt) { preview.src = ''; preview.style.display = 'none'; prompt.style.display = 'block'; }

    aiAnalysisResult = null;
    const aiPanel = document.getElementById('aiPanel');
    if (aiPanel) aiPanel.innerHTML = '';

    if (marker && map) {
        const center = map.getCenter();
        marker.setLatLng(center);
        updateCoordInputs(center.lat, center.lng);
    }
};

// ─── Utility ──────────────────────────────────────────────────────────────────
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
