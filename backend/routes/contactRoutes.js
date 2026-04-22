const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const MESSAGES_FILE = path.join(__dirname, '../db/contact_messages.txt');

if (!fs.existsSync(path.dirname(MESSAGES_FILE))) {
    fs.mkdirSync(path.dirname(MESSAGES_FILE), { recursive: true });
}
if (!fs.existsSync(MESSAGES_FILE)) {
    fs.writeFileSync(MESSAGES_FILE, '[]');
}

router.post('/', (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        if(!name || !email || !subject || !message) {
            return res.status(400).json({ success: false, error: 'All fields are required.' });
        }
        
        // Email formatting validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if(!emailRegex.test(email)) {
            return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
        }

        if(message.length < 20) {
            return res.status(400).json({ success: false, error: 'Message must be at least 20 characters.' });
        }

        const raw = fs.readFileSync(MESSAGES_FILE, 'utf8');
        let messages = [];
        try { messages = JSON.parse(raw); } catch(e) { messages = []; }

        const newMessage = {
            id: Date.now().toString(),
            name,
            email,
            subject,
            message,
            timestamp: new Date().toISOString()
        };

        messages.push(newMessage);
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));

        res.json({ success: true, data: { message: 'Sent!' } });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
