const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5000;
const DB_FILE = path.join(__dirname, 'database.json');
const AGENTS_FILE = path.join(__dirname, 'agents.json');

// Initialize DB files if they don't exist
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));
if (!fs.existsSync(AGENTS_FILE)) fs.writeFileSync(AGENTS_FILE, JSON.stringify([
    { name: "Admin", pin: "0000" } // Default admin agent
]));

const server = http.createServer((req, res) => {
    // Basic CORS handling
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, bypass-tunnel-reminder');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    // API: Sync data from Mobile App
    if (req.method === 'POST' && req.url === '/api/sync') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                // payload has { agent, pin, records }
                const incomingRecords = payload.records || [];
                
                let currentData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
                
                // Merge records avoiding duplicates
                let added = 0;
                incomingRecords.forEach(newRec => {
                    if (!currentData.find(c => c.code === newRec.code)) {
                        currentData.push(newRec);
                        added++;
                    }
                });

                fs.writeFileSync(DB_FILE, JSON.stringify(currentData, null, 2));
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, added }));
            } catch (err) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // API: Get all cards for Dashboard
    if (req.method === 'GET' && req.url === '/api/cards') {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(data);
    }

    // API: Get agents
    if (req.method === 'GET' && req.url === '/api/agents') {
        const data = fs.readFileSync(AGENTS_FILE, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(data);
    }

    // API: Add agent
    if (req.method === 'POST' && req.url === '/api/agents') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const newAgent = JSON.parse(body);
                let agents = JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8'));
                agents.push(newAgent);
                fs.writeFileSync(AGENTS_FILE, JSON.stringify(agents, null, 2));
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                res.writeHead(400);
                res.end();
            }
        });
        return;
    }

    // STATIC FILE SERVING (Dashboard)
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    const extname = String(path.extname(filePath)).toLowerCase();
    
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==============================================`);
    console.log(`🚀 TOBAL SCAN SERVER RUNNING`);
    console.log(`==============================================`);
    console.log(`🌐 Dashboard URL : http://localhost:${PORT}`);
    console.log(`📱 App Sync IP   : Use your PC's IP address (e.g. 192.168.1.X)`);
    console.log(`==============================================\n`);
});
