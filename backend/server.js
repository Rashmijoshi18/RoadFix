const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const authRoutes = require('./routes/authRoutes');
const auditRoutes = require('./routes/auditRoutes');
const checkRole = require('./middleware/checkRole');

const app = express();
const PORT = process.env.PORT || 3000;

// ----- FILE UPLOAD SETUP -----
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `image-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'));
    }
});

// ----- PERSISTENCE LOGIC -----
const dbPath = path.join(__dirname, 'db', 'reports.txt');

if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify([]), 'utf-8');
}

const readData = () => {
    try {
        const data = fs.readFileSync(dbPath, 'utf-8');
        let records = data ? JSON.parse(data) : [];
        
        // Migration: patch missing createdAt fields
        let needsSave = false;
        records = records.map(r => {
            if (!r.createdAt) {
                needsSave = true;
                r.createdAt = r.created_at || new Date().toISOString();
            }
            return r;
        });

        if (needsSave) {
            writeData(records);
        }

        return records;
    } catch (err) {
        console.error('Error reading from reports.txt:', err.message);
        return [];
    }
};

const writeData = (data) => {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        console.error('Error writing to reports.txt:', err.message);
    }
};

// ----- MIDDLEWARE -----
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));
// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ----- AUTH ROUTES -----
app.use('/api/auth', authRoutes);

// ----- AUDIT ROUTES -----
app.use('/api/audit', auditRoutes);

// ----- Redirect root to login if not authenticated -----
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// ----- API -----
app.get('/api/reports', (req, res) => {
    const { category, status } = req.query;
    let records = readData();
    if (category) records = records.filter(r => r.category === category);
    if (status) records = records.filter(r => r.status === status);
    records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data: records, error: null });
});

app.post('/api/reports', upload.single('image'), (req, res) => {
    if (!req.body) return res.status(400).json({ success: false, data: null, error: 'Request body is missing' });
    const { title, description, category, latitude, longitude, address, image_url } = req.body;
    if (!title || !category) return res.status(400).json({ success: false, data: null, error: 'Missing title/category' });

    // Prefer uploaded file; fall back to image_url text field
    let finalImageUrl = null;
    if (req.file) {
        finalImageUrl = `/uploads/${req.file.filename}`;
    } else if (image_url && image_url.trim()) {
        finalImageUrl = image_url.trim();
    }

    const records = readData();
    const newId = records.length > 0 ? Math.max(...records.map(r => r.id)) + 1 : 1;
    const newReport = {
        id: newId,
        title,
        description: description || null,
        category,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        address: address || null,
        image_url: finalImageUrl,
        status: 'Reported',
        solution: null,
        created_at: new Date().toISOString(),
        createdAt: new Date().toISOString()
    };
    records.push(newReport);
    writeData(records);
    res.status(201).json({ success: true, data: { reportId: newId }, error: null });
});

app.patch('/api/reports/:id/status', checkRole(['admin', 'inspector']), (req, res) => {
    const { id } = req.params;
    const { status, solution } = req.body;
    const records = readData();
    const index = records.findIndex(r => r.id == id);
    if (index === -1) return res.status(404).json({ success: false, data: null, error: 'Not found' });
    records[index].status = status;
    if (solution !== undefined) records[index].solution = solution;
    writeData(records);
    res.json({ success: true, data: { message: 'Updated' }, error: null });
});

// NOTE: /stats MUST be before /:id so Express doesn't treat 'stats' as an id param
app.get('/api/reports/stats', (req, res) => {
    const records = readData();
    const statsObj = records.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
    }, {});
    const rows = Object.keys(statsObj).map(s => ({ status: s, count: statsObj[s] }));
    res.json({ success: true, data: rows, error: null });
});

app.delete('/api/reports/:id', checkRole(['admin']), (req, res) => {
    const { id } = req.params;
    let records = readData();
    const initial = records.length;
    records = records.filter(r => r.id != id);
    if (records.length === initial) return res.status(404).json({ success: false, data: null, error: 'Not found' });
    writeData(records);
    res.json({ success: true, data: { message: 'Deleted' }, error: null });
});

// ----- CONTACT API -----
const contactDbPath = path.join(__dirname, 'db', 'contact_messages.txt');
if (!fs.existsSync(path.dirname(contactDbPath))) fs.mkdirSync(path.dirname(contactDbPath), { recursive: true });
if (!fs.existsSync(contactDbPath)) fs.writeFileSync(contactDbPath, JSON.stringify([]), 'utf-8');

app.post('/api/contact', (req, res) => {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const raw = fs.readFileSync(contactDbPath, 'utf-8');
        const messages = raw ? JSON.parse(raw) : [];
        const newMessage = {
            id: Date.now(),
            name,
            email,
            subject,
            message,
            created_at: new Date().toISOString()
        };
        messages.push(newMessage);
        fs.writeFileSync(contactDbPath, JSON.stringify(messages, null, 2), 'utf-8');
        res.status(201).json({ message: 'Contact message received' });
    } catch (err) {
        console.error('Error saving contact message:', err);
        res.status(500).json({ error: 'Failed to save message' });
    }
});

// START
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
