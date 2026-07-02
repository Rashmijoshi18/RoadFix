// Constants
const API_URL = '/api/reports';

// Map Initialization
let map;
let marker;

document.addEventListener('DOMContentLoaded', () => {
    // Only initialize map if coordinates exist on page (index.html)
    const mapElement = document.getElementById('map');
    if (mapElement) {
        initMap();
    }

    // Form submission
    const form = document.getElementById('reportForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
});

function initMap() {
    let defaultCoords = [40.7128, -74.0060]; // NY

    map = L.map('map').setView(defaultCoords, 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    marker = L.marker(defaultCoords, { draggable: true }).addTo(map);
    updateInputs(defaultCoords[0], defaultCoords[1]);

    map.on('click', function(e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        marker.setLatLng([lat, lng]);
        updateInputs(lat, lng);
    });

    marker.on('dragend', function(e) {
        const position = marker.getLatLng();
        updateInputs(position.lat, position.lng);
    });

    // Geolocation
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const pos = [position.coords.latitude, position.coords.longitude];
                map.setView(pos, 15);
                marker.setLatLng(pos);
                updateInputs(pos[0], pos[1]);
            },
            () => {
                console.log("Geolocation failed or denied. Using default coords.");
            }
        );
    }
}

function updateInputs(lat, lng) {
    document.getElementById('latitude').value = lat;
    document.getElementById('longitude').value = lng;
}

// Handle Form Submit
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = document.getElementById('submitBtn');
    const msgBox = document.getElementById('formMessage');
    
    // Disable btn and show spinner
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    if (msgBox) msgBox.className = 'message hidden';

    try {
        const formData = new FormData(form);

        // Send as multipart/form-data so the server (multer) can receive the image file
        const response = await fetch(API_URL, {
            method: 'POST',
            body: formData,
            headers: {
                'x-user-role': localStorage.getItem('userRole') || 'unknown',
                'x-user-id': localStorage.getItem('userId') || 'unknown',
                'x-user-name': localStorage.getItem('userName') || 'Unknown'
            }
        });

        const data = await response.json();

        if (response.ok) {
            // Grab details before resetting the form
            const reportTitle = formData.get('title') || 'your issue';

            // Hide the form, show success banner
            form.style.display = 'none';
            const banner = document.getElementById('successBanner');
            const detail = document.getElementById('successDetail');
            if (detail) {
                detail.innerHTML = `"<strong>${reportTitle}</strong>" has been logged with Tracking ID <strong>#${data.data ? data.data.reportId : data.reportId}</strong>. Our team will review it shortly.`;
            }
            if (banner) {
                banner.classList.remove('hidden');
                banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            // Also reset the internal form data & map
            form.reset();
            if (marker && map) {
                const center = map.getCenter();
                marker.setLatLng(center);
                updateInputs(center.lat, center.lng);
            }
        } else {
            throw new Error(data.error || 'Failed to submit report');
        }
    } catch (err) {
        console.error(err);
        if (window.showToast) window.showToast(err.message || 'An error occurred. Please try again.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Report';
    }
}

// Restore the form after showing the success banner
window.resetToForm = function() {
    const banner = document.getElementById('successBanner');
    const form = document.getElementById('reportForm');
    if (banner) banner.classList.add('hidden');
    if (form) {
        form.style.display = '';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};
