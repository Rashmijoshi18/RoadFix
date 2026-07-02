document.addEventListener('DOMContentLoaded', () => {
    const role = localStorage.getItem('userRole');
    const name = localStorage.getItem('userName') || '';
    const userId = localStorage.getItem('userId') || 'unknown';

    if (!role) {
        window.location.href = 'login.html';
        return;
    }

    if (role === 'admin') {
        const auditLink = document.getElementById('auditNavLink');
        if (auditLink) auditLink.style.display = 'block';
    }

    const info = document.getElementById('navUserInfo');
    if (info) {
        info.innerHTML = `<span class="role-badge role-${role}">${role.charAt(0).toUpperCase() + role.slice(1)}</span><button class="btn-logout" id="logoutBtn" title="Logout"><i class="fas fa-sign-out-alt"></i></button>`;
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'x-user-role': role || 'unknown',
                        'x-user-id': userId,
                        'x-user-name': name || 'Unknown'
                    }
                });
            } catch (error) {
                console.error('Logout error:', error);
            }

            localStorage.clear();
            window.location.href = 'login.html';
        });
    }
});
