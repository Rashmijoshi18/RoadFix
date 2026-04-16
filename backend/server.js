const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');

const authRoutes = require('./routes/authRoutes');
const auditRoutes = require('./routes/auditRoutes');
const reportRoutes = require('./routes/reportRoutes');
const reportController = require('./controllers/reportController');

const app = express();
const httpServer = http.createServer(app);
// Attach socket.io
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

// Fix circular dependency
reportController.setIO(io);

const PORT = process.env.PORT || 3000;

// ----- FILE UPLOAD SETUP -----
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ----- MIDDLEWARE -----
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend and uploads
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ----- ROUTES -----
app.use('/api/auth', authRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/reports', reportRoutes);

// ----- SOCKET.IO LOGIC -----
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('Client left:', socket.id);
    });
});

// ----- Redirect root to login -----
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// EXPORT
module.exports = { app, io, httpServer };

// START SERVER
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
