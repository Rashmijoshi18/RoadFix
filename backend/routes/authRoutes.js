const express = require('express');
const router = express.Router();

const USERS = [
  { id:"user1", name:"Admin User", email:"admin@roadfix.com", password:"admin123", role:"admin" },
  { id:"user2", name:"Raj Kumar", email:"inspector@roadfix.com", password:"inspect123", role:"inspector"},
  { id:"user3", name:"Priya Singh", email:"citizen@roadfix.com", password:"citizen123", role:"citizen" }
];

router.post('/login', (req, res) => {
    const { email, password } = req.body;
    const user = USERS.find(u => u.email === email && u.password === password);
    
    if (user) {
        const { password, ...userData } = user; // Exclude password from the returned object for security
        res.json({ success: true, data: userData });
    } else {
        res.status(401).json({ success: false, error: "Invalid credentials" });
    }
});

router.post('/logout', (req, res) => {
    // True session invalidation could be managed here with tokens/cookies.
    // For local storage implementation, backend acknowledges the logout request.
    res.json({ success: true });
});

router.get('/me', (req, res) => {
    const userId = req.headers['x-user-id'];
    const user = USERS.find(u => u.id === userId);
    
    if (user) {
        const { password, ...userData } = user;
        res.json({ success: true, data: userData });
    } else {
        res.status(404).json({ success: false, error: "User not found" });
    }
});

module.exports = router;
