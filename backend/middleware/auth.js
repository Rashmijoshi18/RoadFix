/**
 * JWT Authentication Middleware — RoadFix
 *
 * Provides:
 *   authenticateToken  — verifies access token from httpOnly cookie; attaches req.user
 *   optionalAuth       — same but doesn't reject; useful for public routes that show extra data when logged in
 */

const jwt = require('jsonwebtoken');
const logger = require('./logger');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'roadfix_access_secret_change_in_prod';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'roadfix_refresh_secret_change_in_prod';
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

/**
 * Sign a new access token
 */
function signAccessToken(payload) {
    return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
}

/**
 * Sign a new refresh token
 */
function signRefreshToken(payload) {
    return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
}

/**
 * Set JWT cookies on the response (httpOnly, sameSite: strict)
 */
function setAuthCookies(res, accessToken, refreshToken) {
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('rf_access', accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.cookie('rf_refresh', refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
}

/**
 * Clear auth cookies on logout
 */
function clearAuthCookies(res) {
    res.clearCookie('rf_access', { httpOnly: true, sameSite: 'strict' });
    res.clearCookie('rf_refresh', { httpOnly: true, sameSite: 'strict' });
}

/**
 * Middleware: verify access token from cookie.
 * If expired, attempt refresh using refresh cookie (auto-rotate).
 */
async function authenticateToken(req, res, next) {
    const accessToken = req.cookies?.rf_access;
    const refreshToken = req.cookies?.rf_refresh;

    if (!accessToken && !refreshToken) {
        return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
    }

    // Try access token first
    if (accessToken) {
        try {
            req.user = jwt.verify(accessToken, ACCESS_SECRET);
            return next();
        } catch (err) {
            if (err.name !== 'TokenExpiredError') {
                logger.warn(`Invalid access token: ${err.message}`);
                clearAuthCookies(res);
                return res.status(401).json({ success: false, error: 'Invalid session. Please log in again.' });
            }
            // Access token expired — try to refresh below
        }
    }

    // Access token missing or expired — attempt silent refresh
    if (refreshToken) {
        try {
            const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
            const payload = {
                id: decoded.id,
                email: decoded.email,
                name: decoded.name,
                role: decoded.role,
                ward: decoded.ward,
                zone: decoded.zone
            };

            const newAccessToken = signAccessToken(payload);
            const newRefreshToken = signRefreshToken(payload);
            setAuthCookies(res, newAccessToken, newRefreshToken);

            req.user = payload;
            logger.info(`Token silently refreshed for user: ${payload.email}`);
            return next();
        } catch (err) {
            logger.warn(`Refresh token invalid: ${err.message}`);
            clearAuthCookies(res);
            return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
        }
    }

    clearAuthCookies(res);
    return res.status(401).json({ success: false, error: 'Authentication required.' });
}

/**
 * Middleware: optional auth — attach user if token present, else continue as guest
 */
function optionalAuth(req, res, next) {
    const accessToken = req.cookies?.rf_access;
    if (accessToken) {
        try {
            req.user = jwt.verify(accessToken, ACCESS_SECRET);
        } catch {
            req.user = null;
        }
    }
    next();
}

/**
 * Middleware factory: restrict access to specific roles
 * Usage: checkRole('admin', 'zone_manager')
 */
function checkRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'Authentication required.' });
        }

        const userRole = (req.user.role || '').toLowerCase();
        const allowed = allowedRoles.map(r => r.toLowerCase());

        if (!allowed.includes(userRole)) {
            logger.warn(`Access denied: user ${req.user.email} (${userRole}) tried to access role-restricted route. Required: ${allowed.join('|')}`);
            return res.status(403).json({
                success: false,
                error: `Access denied. This action requires one of the following roles: ${allowedRoles.join(', ')}.`
            });
        }

        next();
    };
}

module.exports = {
    authenticateToken,
    optionalAuth,
    checkRole,
    signAccessToken,
    signRefreshToken,
    setAuthCookies,
    clearAuthCookies,
    ACCESS_SECRET,
    REFRESH_SECRET
};
