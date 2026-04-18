const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/authRoutes');
const auditRoutes = require('./routes/auditRoutes');
const reportRoutes = require('./routes/reportRoutes');
const contactRoutes = require('./routes/contactRoutes');
const reportController = require('./controllers/reportController');

const app = express();
const httpServer = http.createServer(app);

// Attach socket.io
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

// Export IO cleanly avoiding circular dependencies
reportController.setIO(io);

const PORT = process.env.PORT || 3000;

// ----- FILE UPLOAD SETUP -----
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ----- MIDDLEWARE -----
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static frontend assets cleanly
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ----- ROUTES -----
app.use('/api/auth', authRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/contact', contactRoutes);

// ----- SOCKET.IO LOGIC -----
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('Client left:', socket.id);
    });
});

// ----- FALLBACK ROUTE -----
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// ----- START SERVER -----
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
