// panel.js - Admin Monitoring Panel
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
// Attach WebSocket server on a specific path so clients can connect using /admin-ws
const wss = new WebSocket.Server({ server, path: '/admin-ws' });

// Handle WebSocketServer-level errors gracefully (e.g. port already in use)
wss.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
        console.error(`Admin WS error: port already in use (${err.code}).`);
        return;
    }
    console.error('Admin WS error:', err && err.message);
});

// Store active connections and users
// activeConnections stores connectedAt as epoch (ms) for reliable math
const activeConnections = new Map(); // socket.id -> { socketId, username, ip, connectedAt }
const connectionLogs = [];

// Helper function for timestamps (ISO)
function getTimestamp() {
    return new Date().toISOString();
}

// WebSocket connection for real-time updates
wss.on('connection', (ws) => {
    // Send current state to new admin panel connections
    const usersForClient = Array.from(activeConnections.values()).map(u => ({
        socketId: u.socketId,
        username: u.username,
        ip: u.ip,
        connectedAt: new Date(u.connectedAt).toISOString()
    }));

    ws.send(JSON.stringify({
        type: 'init',
        users: usersForClient,
        logs: connectionLogs.slice(-100) // Last 100 logs
    }));
});

// Function to broadcast updates to all admin panels
function broadcastUpdate(newLog) {
    const usersForClient = Array.from(activeConnections.values()).map(u => ({
        socketId: u.socketId,
        username: u.username,
        ip: u.ip,
        connectedAt: new Date(u.connectedAt).toISOString()
    }));

    const payload = {
        type: 'update',
        userCount: activeConnections.size,
        users: usersForClient,
        newLogs: Array.isArray(newLog) ? newLog : (newLog ? [newLog] : [])
    };

    const data = JSON.stringify(payload);
    
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// Middleware to serve static files (serve panel.html from repo root)
app.use(express.static(path.join(__dirname)));
app.get('/panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'panel.html'));
});

// API endpoint to get current data
app.get('/api/data', (req, res) => {
    res.json({
        userCount: activeConnections.size,
        users: Array.from(activeConnections.values()).map(u => ({
            socketId: u.socketId,
            username: u.username,
            ip: u.ip,
            connectedAt: new Date(u.connectedAt).toISOString()
        })),
        logs: connectionLogs
    });
});

// This would be called from your main server.js when events occur
module.exports = {
    logConnection: (socketId, username, ip) => {
        const timestamp = getTimestamp();
        const now = Date.now();
        const userData = { 
            socketId, 
            username, 
            ip, 
            connectedAt: now 
        };
        
        activeConnections.set(socketId, userData);
        connectionLogs.push({
            timestamp,
            event: 'connect',
            socketId,
            username,
            ip
        });

        // broadcast only the new log
        broadcastUpdate(connectionLogs.slice(-1));
    },
    
    logDisconnection: (socketId) => {
        const timestamp = getTimestamp();
        const user = activeConnections.get(socketId) || {};
        const duration = user.connectedAt ? Math.round((Date.now() - user.connectedAt) / 1000) : 0;
        
        const logEntry = {
            timestamp,
            event: 'disconnect',
            socketId,
            username: user.username,
            ip: user.ip,
            duration
        };

        connectionLogs.push(logEntry);
        activeConnections.delete(socketId);
        broadcastUpdate(logEntry);
    },
    
    logMessage: (from, to, message) => {
        const timestamp = getTimestamp();
        const safeMsg = typeof message === 'string' ? message.substring(0, 100) : '';
        const logEntry = {
            timestamp,
            event: 'message',
            from,
            to,
            message: safeMsg
        };
        connectionLogs.push(logEntry);
        broadcastUpdate(logEntry);
    }
};

// Start the admin panel server if run directly
const PORT = process.env.PORT || 3001;
if (require.main === module) {
    // handle listen errors (port in use) gracefully so dev tooling doesn't crash
    server.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
            console.error(`Admin panel: port ${PORT} already in use. Panel will not start. Set PORT env or free the port.`);
            return;
        }
        console.error('Admin panel server error:', err && err.message);
    });

    server.listen(PORT, () => {
        console.log(`Admin panel running on http://localhost:${PORT}`);
    });
}
