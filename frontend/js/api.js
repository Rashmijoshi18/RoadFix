/**
 * RoadFix — Centralized API Service Layer
 *
 * All fetch calls go through apiClient().
 * - Automatically includes credentials (httpOnly cookies)
 * - On 401, attempts silent token refresh → retries once
 * - Consistent error handling
 * - No manual x-user-* headers needed (JWT cookie handles identity)
 */

const API_BASE = '/api';

let isRefreshing = false;
let refreshPromise = null;

/**
 * Core fetch wrapper
 * @param {string} endpoint - e.g. '/reports', '/auth/me'
 * @param {RequestInit} options
 * @param {boolean} _isRetry - internal: prevent infinite retry loop
 */
async function apiClient(endpoint, options = {}, _isRetry = false) {
    const url = `${API_BASE}${endpoint}`;

    const config = {
        ...options,
        credentials: 'include', // Always send httpOnly cookies
        headers: {
            ...(options.body && !(options.body instanceof FormData)
                ? { 'Content-Type': 'application/json' }
                : {}),
            ...options.headers
        }
    };

    // Serialize body if it's a plain object
    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
        config.body = JSON.stringify(config.body);
    }

    try {
        const response = await fetch(url, config);

        // Handle 401 — attempt token refresh once
        if (response.status === 401 && !_isRetry) {
            if (!isRefreshing) {
                isRefreshing = true;
                refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
                    method: 'POST',
                    credentials: 'include'
                }).finally(() => {
                    isRefreshing = false;
                    refreshPromise = null;
                });
            }

            const refreshResponse = await refreshPromise;
            if (refreshResponse && refreshResponse.ok) {
                // Retry original request with refreshed cookie
                return apiClient(endpoint, options, true);
            } else {
                // Refresh failed — redirect to login
                window.location.href = '/login.html';
                return null;
            }
        }

        // Parse JSON response
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = { success: response.ok };
        }

        if (!response.ok) {
            const err = new Error(data?.error || `HTTP ${response.status}`);
            err.status = response.status;
            err.data = data;
            throw err;
        }

        return data;
    } catch (err) {
        // Network or parse error
        if (!err.status) {
            err.message = err.message || 'Network error. Please check your connection.';
        }
        throw err;
    }
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

const api = {
    get: (endpoint, params) => {
        const url = params ? `${endpoint}?${new URLSearchParams(params)}` : endpoint;
        return apiClient(url, { method: 'GET' });
    },
    post: (endpoint, body, isFormData = false) =>
        apiClient(endpoint, {
            method: 'POST',
            body: isFormData ? body : body
        }),
    patch: (endpoint, body) =>
        apiClient(endpoint, { method: 'PATCH', body }),
    put: (endpoint, body) =>
        apiClient(endpoint, { method: 'PUT', body }),
    delete: (endpoint) =>
        apiClient(endpoint, { method: 'DELETE' })
};

// ─── Auth helpers ─────────────────────────────────────────────────────────────

const Auth = {
    /**
     * Fetch current user from JWT cookie. Returns user or null.
     */
    async getCurrentUser() {
        try {
            const data = await apiClient('/auth/me', { method: 'GET' }, true); // skip refresh retry
            return data?.data?.user || null;
        } catch {
            return null;
        }
    },

    /**
     * Login — returns { user } or throws
     */
    async login(email, password) {
        const data = await apiClient('/auth/login', {
            method: 'POST',
            body: { email, password }
        });
        return data?.data?.user;
    },

    /**
     * Register — returns { user } or throws
     */
    async register(name, email, password, phone) {
        const data = await apiClient('/auth/register', {
            method: 'POST',
            body: { name, email, password, phone }
        });
        return data?.data?.user;
    },

    /**
     * Logout — clears cookies server-side
     */
    async logout() {
        try {
            await apiClient('/auth/logout', { method: 'POST' });
        } catch {
            // Still redirect even if logout API fails
        }
        window.location.href = '/login.html';
    }
};

// ─── Session management (minimal localStorage for non-sensitive display data) ─

const Session = {
    _user: null,

    async init() {
        // Load user from cookie (server-validated)
        this._user = await Auth.getCurrentUser();
        if (this._user) {
            // Cache display data in sessionStorage (NOT sensitive, token is in httpOnly cookie)
            sessionStorage.setItem('rf_user', JSON.stringify({
                id: this._user.id,
                name: this._user.name,
                role: this._user.role,
                level: this._user.level,
                points: this._user.points
            }));
        }
        return this._user;
    },

    getUser() {
        if (this._user) return this._user;
        const cached = sessionStorage.getItem('rf_user');
        return cached ? JSON.parse(cached) : null;
    },

    getUserRole() {
        return this.getUser()?.role || null;
    },

    getUserName() {
        return this.getUser()?.name || 'User';
    },

    getUserId() {
        return this.getUser()?.id || null;
    },

    clear() {
        this._user = null;
        sessionStorage.removeItem('rf_user');
    },

    /**
     * Require authenticated session — redirects to login if not authenticated.
     * Returns user object if authenticated.
     */
    async require(allowedRoles = null) {
        const user = await this.init();
        if (!user) {
            window.location.href = '/login.html';
            return null;
        }
        if (allowedRoles && !allowedRoles.includes(user.role)) {
            window.location.href = '/index.html';
            return null;
        }
        return user;
    }
};

// ─── Role-based redirect helper ────────────────────────────────────────────────
function getDashboardUrl(role) {
    // All role dashboards currently share the single dashboard page.
    return '/dashboard.html';
}

// Expose globally
window.apiClient = apiClient;
window.api = api;
window.Auth = Auth;
window.Session = Session;
window.getDashboardUrl = getDashboardUrl;
