/**
 * Centralized Error Handler — RoadFix Backend
 * Must be registered as the LAST middleware in app.js
 */

const logger = require('./logger');

/**
 * Custom error class for operational errors (known, expected errors)
 */
class AppError extends Error {
    constructor(message, statusCode, code = null) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Express error handling middleware
 * Catches all errors passed via next(err)
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
    const statusCode = err.statusCode || 500;
    const isOperational = err.isOperational || false;

    // Always log the error
    if (statusCode >= 500) {
        logger.error(`${req.method} ${req.originalUrl} — ${err.message}`, { stack: err.stack });
    } else {
        logger.warn(`${req.method} ${req.originalUrl} — ${statusCode}: ${err.message}`);
    }

    // Don't leak stack traces to client in production
    const response = {
        success: false,
        error: isOperational ? err.message : 'An unexpected server error occurred.',
        ...(process.env.NODE_ENV !== 'production' && !isOperational && { stack: err.stack }),
        ...(err.code && { code: err.code })
    };

    res.status(statusCode).json(response);
}

/**
 * Catch 404s — register before errorHandler
 */
function notFoundHandler(req, res, next) {
    const err = new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND');
    next(err);
}

module.exports = { AppError, errorHandler, notFoundHandler };
