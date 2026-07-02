// Authentication Logic for RoadFix

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const authMessage = document.getElementById('authMessage');

    const showMessage = (msg, type) => {
        authMessage.innerText = msg;
        authMessage.className = `message ${type}`;
        authMessage.classList.remove('hidden');
    };

    // Handle Login
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();
                if (response.ok) {
                    showMessage('Login successful! Redirecting...', 'success');
                    localStorage.setItem('user', JSON.stringify(data.user));
                    setTimeout(() => {
                        window.location.href = 'index.html';
                    }, 1500);
                } else {
                    showMessage(data.error || 'Login failed', 'error');
                }
            } catch (err) {
                console.error('Login error:', err);
                showMessage('Server error. Please try again later.', 'error');
            }
        });
    }

    // Handle Registration
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('regName').value;
            const email = document.getElementById('regEmail').value;
            const password = document.getElementById('regPassword').value;

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password })
                });

                const data = await response.json();
                if (response.ok) {
                    showMessage('Registration successful! You can now log in.', 'success');
                    setTimeout(() => {
                        switchTab('login');
                    }, 2000);
                } else {
                    showMessage(data.error || 'Registration failed', 'error');
                }
            } catch (err) {
                console.error('Registration error:', err);
                showMessage('Server error. Please try again later.', 'error');
            }
        });
    }

    // Check auth status on all pages
    updateNav();
});

function updateNav() {
    const user = JSON.parse(localStorage.getItem('user'));
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;

    // Check if Login link already exists
    let loginLink = document.querySelector('a[href="login.html"]');
    
    if (user) {
        // User is logged in
        if (loginLink) loginLink.parentElement.remove();
        
        // Add Profile/Logout
        if (!document.querySelector('.nav-user')) {
             const userLi = document.createElement('li');
             userLi.className = 'nav-user';
             userLi.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.75rem; color: var(--text-primary); cursor: pointer;" onclick="toggleUserDropdown()">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700;">
                        ${user.name.charAt(0).toUpperCase()}
                    </div>
                    <span>${user.name.split(' ')[0]}</span>
                    <i class="fas fa-chevron-down" style="font-size: 0.8rem;"></i>
                </div>
                <div id="userDropdown" style="display: none; position: absolute; top: 100%; right: 0; background: var(--bg-solid); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); width: 160px; z-index: 1001; padding: 0.5rem 0;">
                    <a href="#" onclick="logout()" style="display: block; padding: 0.75rem 1rem; color: var(--danger); font-weight: 600; text-decoration: none; transition: var(--transition);">
                        <i class="fas fa-sign-out-alt"></i> Logout
                    </a>
                </div>
             `;
             userLi.style.position = 'relative';
             navLinks.appendChild(userLi);
        }
    } else {
        // User is not logged in
        if (!loginLink) {
            const loginBtn = document.createElement('li');
            loginBtn.innerHTML = '<a href="login.html" class="btn-premium" style="padding: 0.6rem 1.5rem; font-size: 0.9rem;">Login</a>';
            navLinks.appendChild(loginBtn);
        }
    }
}

function toggleUserDropdown() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
}

function logout() {
    localStorage.removeItem('user');
    window.location.reload();
}

// Close dropdown when clicking outside
window.addEventListener('click', (e) => {
    const dropdown = document.getElementById('userDropdown');
    const userTrigger = document.querySelector('.nav-user');
    if (dropdown && userTrigger && !userTrigger.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});
