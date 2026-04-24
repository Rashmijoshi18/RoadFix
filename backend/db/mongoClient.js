const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.MONGODB_DB_NAME || 'roadfix';

let client;
let dbPromise;

async function connectToDatabase() {
    if (dbPromise) return dbPromise;

    client = new MongoClient(mongoUri);
    dbPromise = client.connect().then(() => {
        const db = client.db(dbName);
        return db;
    });

    return dbPromise;
}

async function getCollection(name) {
    const db = await connectToDatabase();
    return db.collection(name);
}

async function ensureIndexes() {
    const reports = await getCollection('reports');
    const users = await getCollection('users');
    const contacts = await getCollection('contact_messages');

    await Promise.all([
        reports.createIndex({ createdAt: -1 }),
        reports.createIndex({ category: 1, status: 1 }),
        users.createIndex({ email: 1 }, { unique: true }),
        contacts.createIndex({ timestamp: -1 })
    ]);
}

async function seedDefaultUsers() {
    const users = await getCollection('users');
    const count = await users.countDocuments();

    if (count > 0) return;

    await users.insertMany([
        { id: 'user1', name: 'Admin User', email: 'admin@roadfix.com', password: 'admin123', role: 'admin' },
        { id: 'user2', name: 'Raj Kumar', email: 'inspector@roadfix.com', password: 'inspect123', role: 'inspector' },
        { id: 'user3', name: 'Priya Singh', email: 'citizen@roadfix.com', password: 'citizen123', role: 'citizen' }
    ]);
}

module.exports = {
    connectToDatabase,
    getCollection,
    ensureIndexes,
    seedDefaultUsers
};
