// panel.js - Admin Monitoring Panel
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store active connections and users
const activeConnections = new Map(); // socket.id -> { username, ip, connectedAt }
const connectionLogs = [];

// Helper function for timestamps
function getTimestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

// WebSocket connection for real-time updates
wss.on('connection', (ws) => {
    // Send current state to new admin panel connections
    ws.send(JSON.stringify({
        type: 'init',
        users: Array.from(activeConnections.values()),
        logs: connectionLogs.slice(-100) // Last 100 logs
    }));
});

// Function to broadcast updates to all admin panels
function broadcastUpdate() {
    const data = JSON.stringify({
        type: 'update',
        userCount: activeConnections.size,
        users: Array.from(activeConnections.values()),
        newLogs: connectionLogs.slice(-1)[0] // Just the latest log
    });
    
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// Middleware to serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to get current data
app.get('/api/data', (req, res) => {
    res.json({
        userCount: activeConnections.size,
        users: Array.from(activeConnections.values()),
        logs: connectionLogs
    });
});

// This would be called from your main server.js when events occur
module.exports = {
    logConnection: (socketId, username, ip) => {
        const timestamp = getTimestamp();
        const userData = { 
            socketId, 
            username, 
            ip, 
            connectedAt: timestamp 
        };
        
        activeConnections.set(socketId, userData);
        connectionLogs.push({
            timestamp,
            event: 'connect',
            socketId,
            username,
            ip
        });
        
        broadcastUpdate();
    },
    
    logDisconnection: (socketId) => {
        const timestamp = getTimestamp();
        const user = activeConnections.get(socketId) || {};
        
        connectionLogs.push({
            timestamp,
            event: 'disconnect',
            socketId,
            username: user.username,
            ip: user.ip,
            duration: user.connectedAt 
                ? Math.round((new Date(timestamp) - new Date(user.connectedAt)) / 1000) 
                : 0
        });
        
        activeConnections.delete(socketId);
        broadcastUpdate();
    },
    
    logMessage: (from, to, message) => {
        const timestamp = getTimestamp();
        connectionLogs.push({
            timestamp,
            event: 'message',
            from,
            to,
            message: message.substring(0, 100) // Truncate long messages
        });
        
        broadcastUpdate();
    }
};

// Start the admin panel server
const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Admin panel running on http://localhost:${PORT}`);
});
