/**
 * RoadFix Main JS
 * Shared functionality across all pages
 */

document.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
});

/**
 * Mobile Menu Toggle Logic
 */
function initMobileMenu() {
    let toggle = document.getElementById('mobile-toggle');
    const navLinks = document.querySelector('.nav-links');
    const navRight = document.querySelector('.nav-right');
    
    // Create mobile toggle button if it doesn't exist
    if (!toggle) {
        toggle = document.createElement('button');
        toggle.id = 'mobile-toggle';
        toggle.className = 'mobile-menu-btn';
        toggle.setAttribute('aria-label', 'Toggle Menu');
        toggle.innerHTML = '<i class="fas fa-bars"></i>';
        
        // Insert before theme toggle or at the end of nav-right
        const themeToggle = document.querySelector('.theme-toggle');
        if (themeToggle && navRight) {
            navRight.insertBefore(toggle, themeToggle);
        } else if (navRight) {
            navRight.appendChild(toggle);
        }
    }

    // Always ensure the event listener is present (remove old one first to avoid duplicates if re-init)
    if (toggle) {
        // Simple way to avoid duplicate listeners if this is called multiple times
        toggle.onclick = () => {
            const isOpen = navLinks.classList.contains('active');
            if (isOpen) {
                closeMobileMenu();
            } else {
                openMobileMenu();
            }
        };
    }
}

function openMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    const toggleIcon = document.querySelector('#mobile-toggle i');
    
    navLinks.classList.add('active');
    if (toggleIcon) {
        toggleIcon.classList.remove('fa-bars');
        toggleIcon.classList.add('fa-times');
    }
    
    // Disable body scroll when menu is open
    document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    const toggleIcon = document.querySelector('#mobile-toggle i');
    
    navLinks.classList.remove('active');
    if (toggleIcon) {
        toggleIcon.classList.remove('fa-times');
        toggleIcon.classList.add('fa-bars');
    }
    
    // Re-enable body scroll
    document.body.style.overflow = '';
}

// Close menu when a link is clicked (useful for SPAs, but good here too)
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
        closeMobileMenu();
    });
});

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    const navLinks = document.querySelector('.nav-links');
    const toggle = document.getElementById('mobile-toggle');
    
    if (navLinks.classList.contains('active') && 
        !navLinks.contains(e.target) && 
        !toggle.contains(e.target)) {
        closeMobileMenu();
    }
});
