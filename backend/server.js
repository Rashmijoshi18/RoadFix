require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const reportController = require('./controllers/reportController');
const { connectToDatabase, ensureIndexes, seedDefaultUsers, seedZonesAndWards } = require('./db/mongoClient');
const logger = require('./middleware/logger');

const httpServer = http.createServer(app);

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim());

const io = new Server(httpServer, {
    cors: {
        origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
        credentials: true
    }
});

reportController.setIO(io);

const PORT = process.env.PORT || 3000;

// ─── Socket.IO — Connection Handling ─────────────────────────────────────────
io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // User joins their personal room for targeted notifications
    socket.on('join:user', (userId) => {
        if (userId) {
            socket.join(`user:${userId}`);
            logger.info(`Socket ${socket.id} joined room: user:${userId}`);
        }
    });

    // User joins their role-based room
    socket.on('join:role', (role) => {
        if (role) {
            socket.join(`role:${role}`);
            logger.info(`Socket ${socket.id} joined room: role:${role}`);
        }
    });

    socket.on('disconnect', () => {
        logger.info(`Socket disconnected: ${socket.id}`);
    });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
async function startServer() {
    try {
        await connectToDatabase();
        await ensureIndexes();
        await seedDefaultUsers();
        await seedZonesAndWards();

        httpServer.listen(PORT, () => {
            logger.info(`RoadFix server running on port ${PORT}`);
            logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
            logger.info(`Dashboard: http://localhost:${PORT}`);
        });
    } catch (err) {
        logger.error(`Failed to start server: ${err.message}`, { stack: err.stack });
        process.exit(1);
    }
}

if (require.main === module) {
    startServer();
}

module.exports = { app, startServer };
