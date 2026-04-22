/**
 * home.js — RoadFix Landing Page
 * - Fetches live stats from /api/reports/stats
 * - Animates stat numbers (ease-out count-up)
 * - Scroll-reveal with stagger
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    initScrollReveal();
});

/* ── STATS ── */
async function loadStats() {
    try {
        const res  = await fetch('/api/reports/stats');
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
            const map   = data.data.reduce((a, s) => { a[s.status] = s.count; return a; }, {});
            const total = data.data.reduce((s, c) => s + c.count, 0);
            animateCount(document.getElementById('statTotal'), total, 1500);
            animateCount(document.getElementById('statFixed'), map['Resolved'] || 0, 1500);
        }
    } catch (e) {
        console.warn('Stats fetch failed:', e.message);
    }
    animateCount(document.getElementById('statUsers'), 5200, 1500);
}

/* ── COUNT-UP ── */
function animateCount(el, target, duration) {
    if (!el) return;
    if (target === 0) { el.textContent = '0'; return; }
    const step = 16;
    const steps = Math.ceil(duration / step);
    let frame = 0;
    const timer = setInterval(() => {
        frame++;
        const progress = frame / steps;
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(eased * target).toLocaleString();
        if (frame >= steps) {
            el.textContent = target.toLocaleString();
            clearInterval(timer);
        }
    }, step);
}

/* ── SCROLL REVEAL ── */
function initScrollReveal() {
    const els = document.querySelectorAll(
        '.home-stat-card, .home-step-card, .home-cta-card, .home-section-title, .home-section-label'
    );
    if (!('IntersectionObserver' in window)) {
        els.forEach(el => el.style.opacity = '1');
        return;
    }
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const siblings = Array.from(entry.target.parentElement?.children || [entry.target]);
            const idx = siblings.indexOf(entry.target);
            setTimeout(() => entry.target.classList.add('home-visible'), idx * 80);
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.12 });
    els.forEach(el => { el.classList.add('home-hidden'); observer.observe(el); });
}
