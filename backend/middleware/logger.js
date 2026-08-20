/**
 * Winston Logger — Centralized logging for RoadFix backend
 * Outputs: console always; file transports only when NOT on Vercel (read-only filesystem).
 */

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

const { combine, timestamp, printf, colorize, errors } = format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack }) => {
    return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`;
});

// Console transport — always active
const consoleTransport = new transports.Console({
    format: combine(
        colorize({ all: true }),
        timestamp({ format: 'HH:mm:ss' }),
        printf(({ level, message, timestamp }) => `[${timestamp}] ${level}: ${message}`)
    )
});

const activeTransports = [consoleTransport];

// File transports — skip on Vercel (read-only filesystem) and in test env
const isVercel = !!process.env.VERCEL;
const isTest = process.env.NODE_ENV === 'test';

if (!isVercel && !isTest) {
    // Ensure logs directory exists only when file transports are needed
    const logsDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }

    activeTransports.push(
        new transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5 * 1024 * 1024, // 5MB
            maxFiles: 5
        }),
        new transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5 * 1024 * 1024,
            maxFiles: 5
        })
    );
}

const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat
    ),
    transports: activeTransports
});

module.exports = logger;
