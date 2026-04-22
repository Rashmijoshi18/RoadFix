/**
 * Role-based access control middleware.
 *
 * Usage:
 *   const checkRole = require('./middleware/checkRole');
 *   app.delete('/api/reports/:id', checkRole(['admin']), handler);
 *
 * Reads the 'x-user-role' header from the incoming request and
 * compares it against the list of allowed roles. Returns 403
 * with a user-friendly message if the role is not permitted.
 */
function checkRole(allowedRoles) {
    return (req, res, next) => {
        const role = (req.headers['x-user-role'] || '').trim().toLowerCase();

        if (!role) {
            return res.status(403).json({
                success: false,
                data: null,
                error: 'Access denied. No role provided. Please log in first.'
            });
        }

        if (!allowedRoles.includes(role)) {
            return res.status(403).json({
                success: false,
                data: null,
                error: 'Access denied. You do not have permission to perform this action.'
            });
        }

        next();
    };
}

module.exports = checkRole;
