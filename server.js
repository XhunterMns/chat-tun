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

// Try to load the admin panel logger (optional)
let panel;
try {
    panel = require('./panel');
} catch (e) {
    // panel is optional; continue without admin logging
    panel = null;
}

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

        // Notify admin panel of new connection (if panel available)
        try {
            if (panel && typeof panel.logConnection === 'function') {
                const ip = socket.handshake && (socket.handshake.address || (socket.request && socket.request.connection && socket.request.connection.remoteAddress)) || '';
                panel.logConnection(socket.id, usernames[socket.id], ip);
            }
        } catch (err) {
            console.warn('panel.logConnection failed', err && err.message);
        }
    });

    // Listen for a "message" event and forward it to the intended recipient
    socket.on('message', ({ to, message }) => {
        // Send the message to the recipient with the sender's username
        safeEmit(to, 'message', { from: usernames[socket.id] || 'Anonymous', message });

        // Log message to admin panel
        try {
            if (panel && typeof panel.logMessage === 'function') {
                panel.logMessage(usernames[socket.id] || 'Anonymous', to, message);
            }
        } catch (err) {
            console.warn('panel.logMessage failed', err && err.message);
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

        // Notify admin panel of disconnection
        try {
            if (panel && typeof panel.logDisconnection === 'function') {
                panel.logDisconnection(socket.id);
            }
        } catch (err) {
            console.warn('panel.logDisconnection failed', err && err.message);
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

