const express = require('express');

// Import Node.js's HTTP module to create the server
const http = require('http');

// Import the Socket.IO library to enable real-time, bidirectional communication
const { Server } = require('socket.io');

// Import the `path` module to work with file and directory paths
const path = require('path');

// Create an instance of an Express application
const app = express();

// Create an HTTP server using the Express app
const server = http.createServer(app);

// Attach a new Socket.IO server to the HTTP server
const io = new Server(server);

// Serve static files (e.g., CSS, JS, images) from the current directory
app.use(express.static(path.join(__dirname)));

// Serve the main HTML file when the root URL ("/") is accessed
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize an array to track unpaired users
let users = [];

// Initialize an object to store user pairings
let pairs = {};

// Initialize an object to map socket IDs to usernames
let usernames = {};

// Initialize a counter to track the total number of connected users
let userCount = 0;

// Helper: safe emit if socket exists
function safeEmit(to, event, payload) {
    try {
        if (io.sockets.sockets.get(to)) {
            io.to(to).emit(event, payload);
        }
    } catch (e) {
        console.warn('safeEmit failed', e && e.message);
    }
}

// Admin WebSocket server will be attached to the same HTTP server
const WebSocket = require('ws');

// Admin state: active users and logs
const adminLogs = [];
const adminClients = new Set(); // Set of ws

function adminBroadcast(payload) {
    const data = JSON.stringify(payload);
    adminClients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
}

function getUsersForAdmin() {
    return Array.from(io.sockets.sockets.values()).map(s => ({
        socketId: s.id,
        username: usernames[s.id] || 'Anonymous',
        ip: (s.handshake && (s.handshake.address || (s.request && s.request.connection && s.request.connection.remoteAddress))) || '',
        connectedAt: (s.connectedAt) ? new Date(s.connectedAt).toISOString() : ''
    }));
}

// Create admin WebSocket server on path /admin-ws (attached to same HTTP server)
const wss = new WebSocket.Server({ noServer: true });

// Handle upgrade requests for the admin WS path
server.on('upgrade', (request, socket, head) => {
    const { url } = request;
    if (url === '/admin-ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

// Admin WS connection handling
wss.on('connection', (ws, req) => {
    adminClients.add(ws);

    // send initial state
    ws.send(JSON.stringify({ type: 'init', users: getUsersForAdmin(), logs: adminLogs.slice(-200) }));

    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg.toString());
            if (data && data.type === 'kick' && data.socketId) {
                const target = io.sockets.sockets.get(data.socketId);
                if (target) {
                    // disconnect the target socket
                    try { target.disconnect(true); } catch (e) { /* ignore */ }
                    const log = { timestamp: new Date().toISOString(), event: 'admin_kick', socketId: data.socketId, admin: true };
                    adminLogs.push(log);
                    adminBroadcast({ type: 'log', payload: log });
                    adminBroadcast({ type: 'update', users: getUsersForAdmin(), newLogs: [log] });
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'socket not found' }));
                }
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'error', message: 'invalid message' }));
        }
    });

    ws.on('close', () => adminClients.delete(ws));
});

// Set up a connection event listener for new clients
io.on('connection', (socket) => {
    // Increment the total user count when a new user connects
    userCount++;

    // Broadcast the updated user count to all connected clients
    io.emit('updateUserCount', userCount);

    // Log the socket ID of the newly connected user
    console.log(`A user connected: ${socket.id}`);

    // Listen for a "setUsername" event from the client to set a username
    socket.on('setUsername', (username) => {
        // Store the username associated with the socket ID
        usernames[socket.id] = username || 'Anonymous';
        socket.connectedAt = Date.now();

        // Add the user's socket ID to the list of unpaired users (avoid duplicates)
        if (!users.includes(socket.id)) users.push(socket.id);

    // If there are at least two users available, pair them
        if (users.length >= 2) {
            // Remove two users from the queue
            const [user1, user2] = users.splice(0, 2);

            // Save the pairing in the `pairs` object
            pairs[user1] = user2;
            pairs[user2] = user1;

            // Notify both users that they have been paired
            safeEmit(user1, 'matched', { partnerSocketId: user2, partnerUsername: usernames[user2] || 'Anonymous' });
            safeEmit(user2, 'matched', { partnerSocketId: user1, partnerUsername: usernames[user1] || 'Anonymous' });
        }

        // Notify admin clients of new connection
        try {
            const ip = (socket.handshake && (socket.handshake.address || (socket.request && socket.request.connection && socket.request.connection.remoteAddress))) || '';
            const log = { timestamp: new Date().toISOString(), event: 'connect', socketId: socket.id, username: usernames[socket.id], ip };
            adminLogs.push(log);
            adminBroadcast({ type: 'update', users: getUsersForAdmin(), newLogs: [log] });
        } catch (err) {
            console.warn('admin notify connect failed', err && err.message);
        }
    });

    // Listen for a "message" event and forward it to the intended recipient
    socket.on('message', ({ to, message }) => {
        // Send the message to the recipient with the sender's username
        safeEmit(to, 'message', { from: usernames[socket.id] || 'Anonymous', message });

        // Log message to admin clients
        try {
            const log = { timestamp: new Date().toISOString(), event: 'message', from: usernames[socket.id] || 'Anonymous', to, message: (typeof message === 'string' ? message.substring(0, 200) : '') };
            adminLogs.push(log);
            adminBroadcast({ type: 'log', payload: log });
        } catch (err) {
            console.warn('admin log message failed', err && err.message);
        }
    });

    // Listen for an "image" event and forward it to the intended recipient
    socket.on('image', ({ to, image }) => {
        // Send the image to the recipient with the sender's username
        safeEmit(to, 'image', { from: usernames[socket.id] || 'Anonymous', image });
    });

    // Listen for a "skip" event to re-pair the user with someone else
    socket.on('skip', () => {
        // Find the current user's partner
        const partner = pairs[socket.id];

        // Notify the partner that the user skipped
        if (partner) {
            safeEmit(partner, 'userSkipped', usernames[socket.id] || 'Anonymous');
            users.push(partner); // Requeue the partner for a new pairing
        }

        // Requeue the current user for a new pairing (avoid duplicates)
        if (!users.includes(socket.id)) users.push(socket.id);

        // Remove the pairings from the `pairs` object
        delete pairs[socket.id];
        delete pairs[partner];

        // If there are enough users, pair them again
        if (users.length >= 2) {
            const [user1, user2] = users.splice(0, 2);
            pairs[user1] = user2;
            pairs[user2] = user1;
            safeEmit(user1, 'matched', { partnerSocketId: user2, partnerUsername: usernames[user2] || 'Anonymous' });
            safeEmit(user2, 'matched', { partnerSocketId: user1, partnerUsername: usernames[user1] || 'Anonymous' });
        }
    });

    // Handle disconnection of a user
    socket.on('disconnect', () => {
        // Find the current user's partner
        const partner = pairs[socket.id];

        // Notify the partner if they exist
        if (partner) {
            safeEmit(partner, 'userDisconnected', usernames[socket.id] || 'Anonymous');
            users.push(partner); // Requeue the partner for a new pairing
        }

        // Remove the disconnected user from the queue
        users = users.filter((id) => id !== socket.id);

        // Remove pairings and username mappings for the disconnected user
        delete pairs[socket.id];
        delete pairs[partner];
        delete usernames[socket.id];

        // Decrement the user count
        userCount--;

        // Broadcast the updated user count to all connected clients
        io.emit('updateUserCount', userCount);

        // Log the socket ID of the disconnected user
        console.log(`A user disconnected: ${socket.id}`);

        // Notify admin clients of disconnection
        try {
            const log = { timestamp: new Date().toISOString(), event: 'disconnect', socketId: socket.id, username: usernames[socket.id] || 'Anonymous' };
            adminLogs.push(log);
            adminBroadcast({ type: 'update', users: getUsersForAdmin(), newLogs: [log] });
        } catch (err) {
            console.warn('admin notify disconnect failed', err && err.message);
        }
    });
});

// Global error handlers to avoid silent crashes
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err && err.stack || err);
    // don't exit automatically; log and continue for now
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});

server.on('error', (err) => {
    console.error('Server error:', err && err.message);
});

// Start the HTTP server and listen on dynamic port for deployment
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

