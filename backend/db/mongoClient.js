/**
 * RoadFix — MongoDB Client + Indexes + Seed Data
 * Extended with new role schema, geospatial index, and zone/ward seed data.
 */

const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const logger = require('../middleware/logger');

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.MONGODB_DB_NAME || 'roadfix';

let client;
let dbPromise;

async function connectToDatabase() {
    if (dbPromise) return dbPromise;

    client = new MongoClient(mongoUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000
    });

    dbPromise = client.connect().then(() => {
        const db = client.db(dbName);
        logger.info(`Connected to MongoDB: ${dbName}`);
        return db;
    });

    return dbPromise;
}

async function getCollection(name) {
    const db = await connectToDatabase();
    return db.collection(name);
}

async function ensureIndexes() {
    const reports   = await getCollection('reports');
    const users     = await getCollection('users');
    const contacts  = await getCollection('contact_messages');
    const notifs    = await getCollection('notifications');
    const zones     = await getCollection('zones');

    await Promise.all([
        // Reports indexes
        reports.createIndex({ createdAt: -1 }),
        reports.createIndex({ category: 1, status: 1 }),
        reports.createIndex({ status: 1 }),
        reports.createIndex({ ward: 1 }),
        reports.createIndex({ zone: 1 }),
        reports.createIndex({ priority: 1 }),
        reports.createIndex({ 'reportedBy.userId': 1 }),
        reports.createIndex({ 'assignedTo.officerId': 1 }),
        // Geospatial index for duplicate detection + map queries
        reports.createIndex({ latitude: 1, longitude: 1 }),

        // Users indexes
        users.createIndex({ email: 1 }, { unique: true }),
        users.createIndex({ role: 1 }),
        users.createIndex({ points: -1 }), // For leaderboard

        // Other indexes
        contacts.createIndex({ timestamp: -1 }),
        notifs.createIndex({ targetUserId: 1, isRead: 1, createdAt: -1 }),
        notifs.createIndex({ targetRoles: 1, isRead: 1, createdAt: -1 }),
        zones.createIndex({ name: 1 }, { unique: true })
    ]);

    logger.info('Database indexes ensured');
}

async function seedDefaultUsers() {
    const users = await getCollection('users');
    const count = await users.countDocuments();

    if (count > 0) return; // Already seeded

    logger.info('Seeding default users...');

    const [superAdminHash, zoneManagerHash, officerHash, citizenHash] = await Promise.all([
        bcrypt.hash('Admin@2026!', 12),
        bcrypt.hash('ZoneManager@2026!', 12),
        bcrypt.hash('Officer@2026!', 12),
        bcrypt.hash('Citizen@2026!', 12)
    ]);

    const now = new Date().toISOString();

    await users.insertMany([
        {
            id: 'user_superadmin_001',
            name: 'Super Admin',
            email: 'admin@roadfix.com',
            password: superAdminHash,
            role: 'super_admin',
            phone: null,
            ward: null,
            zone: null,
            points: 0,
            level: 'Platinum',
            isDeactivated: false,
            createdAt: now,
            lastLoginAt: null
        },
        {
            id: 'user_zonemanager_001',
            name: 'Priya Sharma',
            email: 'zone.manager@roadfix.com',
            password: zoneManagerHash,
            role: 'zone_manager',
            phone: '+91 98765 43210',
            ward: null,
            zone: 'Zone A',
            points: 0,
            level: 'Gold',
            isDeactivated: false,
            createdAt: now,
            lastLoginAt: null
        },
        {
            id: 'user_officer_001',
            name: 'Raj Kumar',
            email: 'officer@roadfix.com',
            password: officerHash,
            role: 'municipal_officer',
            phone: '+91 87654 32109',
            ward: 'Ward 4',
            zone: 'Zone A',
            points: 0,
            level: 'Silver',
            isDeactivated: false,
            createdAt: now,
            lastLoginAt: null
        },
        {
            id: 'user_citizen_001',
            name: 'Anita Desai',
            email: 'citizen@roadfix.com',
            password: citizenHash,
            role: 'citizen',
            phone: '+91 76543 21098',
            ward: 'Ward 4',
            zone: 'Zone A',
            points: 120,
            level: 'Silver',
            isDeactivated: false,
            createdAt: now,
            lastLoginAt: null
        }
    ]);

    logger.info('Default users seeded. Credentials:');
    logger.info('  Super Admin  — admin@roadfix.com        / Admin@2026!');
    logger.info('  Zone Manager — zone.manager@roadfix.com / ZoneManager@2026!');
    logger.info('  Officer      — officer@roadfix.com      / Officer@2026!');
    logger.info('  Citizen      — citizen@roadfix.com      / Citizen@2026!');
}

async function seedZonesAndWards() {
    const zones = await getCollection('zones');
    const count = await zones.countDocuments();
    if (count > 0) return;

    const now = new Date().toISOString();
    await zones.insertMany([
        {
            name: 'Zone A',
            label: 'North Zone',
            wards: ['Ward 1', 'Ward 2', 'Ward 3', 'Ward 4'],
            managerId: 'user_zonemanager_001',
            createdAt: now
        },
        {
            name: 'Zone B',
            label: 'South Zone',
            wards: ['Ward 5', 'Ward 6', 'Ward 7', 'Ward 8'],
            managerId: null,
            createdAt: now
        },
        {
            name: 'Zone C',
            label: 'East Zone',
            wards: ['Ward 9', 'Ward 10', 'Ward 11', 'Ward 12'],
            managerId: null,
            createdAt: now
        },
        {
            name: 'Zone D',
            label: 'West Zone',
            wards: ['Ward 13', 'Ward 14', 'Ward 15', 'Ward 16'],
            managerId: null,
            createdAt: now
        }
    ]);

    logger.info('Zones and wards seeded (Zone A–D, Wards 1–16)');
}

module.exports = {
    connectToDatabase,
    getCollection,
    ensureIndexes,
    seedDefaultUsers,
    seedZonesAndWards
};
