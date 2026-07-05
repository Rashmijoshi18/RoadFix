document.addEventListener('DOMContentLoaded', () => {
    const role = localStorage.getItem('userRole');
    const name = localStorage.getItem('userName') || '';
    const userId = localStorage.getItem('userId') || 'unknown';

    if (role === 'admin') {
        const auditLink = document.getElementById('auditNavLink');
        if (auditLink) auditLink.style.display = 'block';
    }

    const info = document.getElementById('navUserInfo');
    if (info) {
        info.innerHTML = role ? '' : '<a href="login.html" class="btn btn-primary btn-small nav-auth-link">Sign In</a>';
    }
});
