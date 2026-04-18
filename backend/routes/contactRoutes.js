const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const messagesPath = path.join(__dirname, '..', 'db', 'contact_messages.txt');

if (!fs.existsSync(messagesPath)) {
    fs.writeFileSync(messagesPath, JSON.stringify([]), 'utf-8');
}

function sanitize(str) {
    if (typeof str !== 'string') return '';
    return str.trim().replace(/[<>]/g, '');
}

/**
 * POST /api/contact
 */
router.post('/', (req, res) => {
    try {
        const name    = sanitize(req.body.name    || '');
        const email   = sanitize(req.body.email   || '');
        const subject = sanitize(req.body.subject || '');
        const message = sanitize(req.body.message || '');

        if (!name || !email || !subject || !message) {
            return res.status(400).json({ success: false, data: null, error: 'All fields are required.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, data: null, error: 'Please provide a valid email address.' });
        }

        let messages = [];
        try {
            const raw = fs.readFileSync(messagesPath, 'utf-8');
            messages = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(messages)) messages = [];
        } catch (e) { messages = []; }

        const newMsg = {
            id: messages.length > 0 ? Math.max(...messages.map(m => m.id || 0)) + 1 : 1,
            name, email, subject, message,
            receivedAt: new Date().toISOString()
        };
        messages.push(newMsg);
        fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2), 'utf-8');

        return res.status(201).json({ success: true, data: { id: newMsg.id }, error: null });
    } catch (err) {
        console.error('Contact error:', err.message);
        return res.status(500).json({ success: false, data: null, error: 'An unexpected error occurred.' });
    }
});

module.exports = router;
