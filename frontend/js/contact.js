document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('contactForm');
    const successBanner = document.getElementById('contactSuccess');
    const toastContainer = document.getElementById('toastContainer');

    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData.entries());
            
            const submitBtn = document.getElementById('contactSubmitBtn');
            const originalBtnContent = submitBtn.innerHTML;
            
            try {
                // UI State: Loading
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
                
                // Simulate an API call (or use actual backend if available)
                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                if (response.ok) {
                    contactForm.classList.add('hidden');
                    successBanner.classList.remove('hidden');
                    showToast('Message sent successfully!', 'success');
                } else {
                    throw new Error('Failed to send message');
                }
            } catch (err) {
                console.error('Contact error:', err);
                showToast('Failed to send message. Please try again.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnContent;
            }
        });
    }
});

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle',
        warning: 'fa-exclamation-triangle'
    }[type] || 'fa-info-circle';
    
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function resetContactForm() {
    const contactForm = document.getElementById('contactForm');
    const successBanner = document.getElementById('contactSuccess');
    
    if (contactForm && successBanner) {
        contactForm.reset();
        contactForm.classList.remove('hidden');
        successBanner.classList.add('hidden');
    }
}
