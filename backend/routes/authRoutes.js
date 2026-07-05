const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getCollection } = require('../db/mongoClient');
const { appendAuditLog } = require('../db/auditDatabase');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RULES = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

const PASSWORD_RULES_MESSAGE =
    'Password must be at least 8 characters and include letters, numbers, and special characters.';

const sanitizeUser = (user) => {
    const { password, _id, ...userData } = user;
    return userData;
};

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    try {
        const users = await getCollection('users');
        const normalizedEmail = email.trim().toLowerCase();
        let user = await users.findOne({ email: normalizedEmail });

        if (!user) {
            if (!EMAIL_REGEX.test(normalizedEmail)) {
                return res.status(400).json({ success: false, error: 'Please provide a valid email address' });
            }

            if (!PASSWORD_RULES.test(password)) {
                return res.status(400).json({ success: false, error: PASSWORD_RULES_MESSAGE });
            }

            const passwordHash = await bcrypt.hash(password, 10);
            const generatedName = normalizedEmail.split('@')[0];
            const userId = `user_${Date.now()}`;

            user = {
                id: userId,
                name: generatedName,
                email: normalizedEmail,
                password: passwordHash,
                role: 'citizen',
                createdAt: new Date().toISOString()
            };

            await users.insertOne(user);

            const userData = sanitizeUser(user);

            await appendAuditLog({
                action: 'user.auto_registered',
                actor: { id: userData.id, name: userData.name, role: userData.role },
                details: `Auto-created account for ${userData.email} on first login`
            });

            return res.json({ success: true, data: userData, message: 'Account created and logged in successfully' });
        }

        const storedPassword = user.password || '';
        const isHashed = storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$');
        let isValid = false;

        if (isHashed) {
            isValid = await bcrypt.compare(password, storedPassword);
        } else {
            // Backward compatibility for previously stored plaintext passwords.
            isValid = password === storedPassword;
            if (isValid) {
                const passwordHash = await bcrypt.hash(password, 10);
                await users.updateOne({ _id: user._id }, { $set: { password: passwordHash } });
                user.password = passwordHash;
            }
        }

        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const userData = sanitizeUser(user);

        await appendAuditLog({
            action: 'user.login',
            actor: { id: userData.id, name: userData.name, role: userData.role },
            details: `User ${userData.name} logged in`
        });

        return res.json({ success: true, data: userData });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
    }

    if (!EMAIL_REGEX.test(email)) {
        return res.status(400).json({ success: false, error: 'Please provide a valid email address' });
    }

    if (!PASSWORD_RULES.test(password)) {
        return res.status(400).json({ success: false, error: PASSWORD_RULES_MESSAGE });
    }

    try {
        const users = await getCollection('users');
        const normalizedEmail = email.trim().toLowerCase();
        const existing = await users.findOne({ email: normalizedEmail });

        if (existing) {
            return res.status(409).json({ success: false, error: 'Account already exists for this email' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const userId = `user_${Date.now()}`;

        const newUser = {
            id: userId,
            name: name.trim(),
            email: normalizedEmail,
            password: passwordHash,
            role: 'citizen',
            createdAt: new Date().toISOString()
        };

        await users.insertOne(newUser);

        const userData = sanitizeUser(newUser);

        await appendAuditLog({
            action: 'user.registered',
            actor: { id: userData.id, name: userData.name, role: userData.role },
            details: `New account registered for ${userData.email}`
        });

        return res.status(201).json({ success: true, data: userData });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/logout', async (req, res) => {
    try {
        const actor = {
            id: req.headers['x-user-id'] || 'unknown',
            name: req.headers['x-user-name'] || 'Unknown User',
            role: req.headers['x-user-role'] || 'unknown'
        };

        await appendAuditLog({
            action: 'user.logout',
            actor,
            details: `User ${actor.name} logged out`
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/me', async (req, res) => {
    const userId = req.headers['x-user-id'];

    try {
        const users = await getCollection('users');
        const user = await users.findOne({ id: userId });

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const userData = sanitizeUser(user);
        return res.json({ success: true, data: userData });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
