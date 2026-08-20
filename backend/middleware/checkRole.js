/**
 * checkRole — Legacy compatibility shim.
 * 
 * The new role-checking is now done via the `checkRole` factory in middleware/auth.js.
 * This file is kept for backward compatibility with any legacy code that imports it directly.
 * 
 * New usage: const { checkRole } = require('../middleware/auth');
 */

const { checkRole } = require('./auth');

module.exports = checkRole;
