const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const app = require('../backend/app');
const { connectToDatabase, ensureIndexes, seedDefaultUsers } = require('../backend/db/mongoClient');

let initPromise;

async function initBackend() {
	if (!initPromise) {
		initPromise = (async () => {
			await connectToDatabase();
			await ensureIndexes();
			await seedDefaultUsers();
		})();
	}

	return initPromise;
}

module.exports = async (req, res) => {
	try {
		await initBackend();
		return app(req, res);
	} catch (err) {
		console.error('Vercel backend init failed:', err.message);
		return res.status(500).json({ success: false, error: 'Backend initialization failed' });
	}
};
