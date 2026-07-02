document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('contactForm');
    const successBanner = document.getElementById('contactSuccess');

    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData.entries());

            const errorMessage = document.getElementById('contactError');
            const submitBtn = document.getElementById('contactSubmitBtn');
            if (errorMessage) {
                errorMessage.classList.add('hidden');
                errorMessage.textContent = '';
            }

            if (!submitBtn) return;
            const originalBtnContent = submitBtn.innerHTML;

            try {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                let payload = null;
                try {
                    payload = await response.json();
                } catch (parseError) {
                    payload = null;
                }

                if (!response.ok || !payload || payload.success === false) {
                    throw new Error((payload && payload.error) || 'Failed to send message.');
                }

                if (contactForm) {
                    contactForm.reset();
                }
                if (successBanner) {
                    successBanner.classList.remove('hidden');
                }
                if (window.showToast) window.showToast('Message sent successfully!', 'success');
            } catch (err) {
                console.error('Contact error:', err);
                if (errorMessage) {
                    errorMessage.textContent = err.message || 'Failed to send message. Please try again.';
                    errorMessage.classList.remove('hidden');
                }
                if (window.showToast) window.showToast('Failed to send message. Please try again.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnContent;
            }
        });
    }
});
