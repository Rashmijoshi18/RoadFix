require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const reportController = require('./controllers/reportController');
const { connectToDatabase, ensureIndexes, seedDefaultUsers } = require('./db/mongoClient');

const httpServer = http.createServer(app);

// Attach socket.io
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

// Export IO cleanly avoiding circular dependencies
reportController.setIO(io);

const PORT = process.env.PORT || 3000;

// ----- SOCKET.IO LOGIC -----
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('Client left:', socket.id);
    });
});

// ----- START SERVER -----
async function startServer() {
    try {
        await connectToDatabase();
        await ensureIndexes();
        await seedDefaultUsers();

        httpServer.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log('MongoDB connection established');
        });
    } catch (err) {
        console.error('Failed to start server:', err.message);
        process.exit(1);
    }
}

if (require.main === module) {
    startServer();
}

module.exports = { app, startServer };
