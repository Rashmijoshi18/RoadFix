const fs = require('fs');
const path = require('path');

// ----- PERSISTENCE LOGIC (reports.txt) -----
// Storing data in a simple JSON file within the db/ folder
const dbPath = path.join(__dirname, 'reports.txt');

// Initialize txt file if it doesn't exist
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify([]), 'utf-8');
}

const readData = () => {
    try {
        const data = fs.readFileSync(dbPath, 'utf-8');
        let records = data ? JSON.parse(data) : [];
        
        let needsSave = false;
        records = records.map(r => {
            if (!r.createdAt) {
                needsSave = true;
                r.createdAt = r.created_at || new Date().toISOString();
            }
            if (!r.upvotedBy) {
                needsSave = true;
                r.upvotedBy = [];
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

// Simplified API to match common database method names for easy integration
const db = {
    all: (query, params, callback) => {
        // Simple simulation of 'SELECT * FROM reports'
        let records = readData();
        
        // Very basic query filtering simulation
        if (params && params.length > 0) {
            // This is a minimal mock for the specific queries used in the app
            if (params.length === 2) { // category and status
                records = records.filter(r => r.category === params[0] && r.status === params[1]);
            } else {
                records = records.filter(r => r.category === params[0] || r.status === params[0]);
            }
        }
        
        callback(null, records);
    },
    run: (query, params, callback) => {
        const records = readData();
        
        if (query.includes('INSERT INTO')) {
            const newId = records.length > 0 ? Math.max(...records.map(r => r.id)) + 1 : 1;
            const newRecord = {
                id: newId,
                title: params[0],
                description: params[1],
                category: params[2],
                latitude: params[3],
                longitude: params[4],
                address: params[5],
                image_url: params[6],
                status: 'Reported',
                solution: null,
                created_at: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                upvotedBy: []
            };
            records.push(newRecord);
            writeData(records);
            callback.call({ lastID: newId }, null);
        } else if (query.includes('UPDATE')) {
            const id = params[params.length - 1];
            const index = records.findIndex(r => r.id.toString() === id.toString());
            if (index !== -1) {
                const setClause = query.split(/SET/i)[1].split(/WHERE/i)[0];
                const columns = setClause.split(',').map(c => c.trim().split('=')[0].trim());
                
                columns.forEach((col, idx) => {
                    let val = params[idx];
                    if (col === 'upvotedBy' && typeof val === 'string') {
                        try { val = JSON.parse(val); } catch(e) { val = []; }
                    }
                    records[index][col] = val;
                });

                writeData(records);
                callback.call({ changes: 1 }, null);
            } else {
                callback.call({ changes: 0 }, null);
            }
        } else if (query.includes('DELETE')) {
            const id = params[0];
            const initialLength = records.length;
            const filtered = records.filter(r => r.id != id);
            writeData(filtered);
            callback.call({ changes: initialLength - filtered.length }, null);
        }
    }
};

module.exports = db;
