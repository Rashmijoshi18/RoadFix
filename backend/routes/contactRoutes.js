const express = require('express');
const router = express.Router();
const { getCollection } = require('../db/mongoClient');

router.post('/', async (req, res) => {
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

        const messages = await getCollection('contact_messages');

        const newMessage = {
            id: Date.now().toString(),
            name,
            email,
            subject,
            message,
            timestamp: new Date().toISOString()
        };

        await messages.insertOne(newMessage);

        res.json({ success: true, data: { message: 'Sent!' } });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
