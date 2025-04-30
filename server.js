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
        usernames[socket.id] = username;

        // Add the user's socket ID to the list of unpaired users
        users.push(socket.id);

        // If there are at least two users available, pair them
        if (users.length >= 2) {
            // Remove two users from the queue
            const [user1, user2] = users.splice(0, 2);

            // Save the pairing in the `pairs` object
            pairs[user1] = user2;
            pairs[user2] = user1;

            // Notify both users that they have been paired
            io.to(user1).emit('matched', { partnerSocketId: user2, partnerUsername: usernames[user2] });
            io.to(user2).emit('matched', { partnerSocketId: user1, partnerUsername: usernames[user1] });
        }
    });

    // Listen for a "message" event and forward it to the intended recipient
    socket.on('message', ({ to, message }) => {
        // Send the message to the recipient with the sender's username
        io.to(to).emit('message', { from: usernames[socket.id], message });
    });

    // Listen for an "image" event and forward it to the intended recipient
    socket.on('image', ({ to, image }) => {
        // Send the image to the recipient with the sender's username
        io.to(to).emit('image', { from: usernames[socket.id], image });
    });

    // Listen for a "skip" event to re-pair the user with someone else
    socket.on('skip', () => {
        // Find the current user's partner
        const partner = pairs[socket.id];

        // Notify the partner that the user skipped
        if (partner) {
            io.to(partner).emit('userSkipped', usernames[socket.id]);
            users.push(partner); // Requeue the partner for a new pairing
        }

        // Requeue the current user for a new pairing
        users.push(socket.id);

        // Remove the pairings from the `pairs` object
        delete pairs[socket.id];
        delete pairs[partner];

        // If there are enough users, pair them again
        if (users.length >= 2) {
            const [user1, user2] = users.splice(0, 2);
            pairs[user1] = user2;
            pairs[user2] = user1;
            io.to(user1).emit('matched', { partnerSocketId: user2, partnerUsername: usernames[user2] });
            io.to(user2).emit('matched', { partnerSocketId: user1, partnerUsername: usernames[user1] });
        }
    });

    // Handle disconnection of a user
    socket.on('disconnect', () => {
        // Find the current user's partner
        const partner = pairs[socket.id];

        // Notify the partner if they exist
        if (partner) {
            io.to(partner).emit('userDisconnected', usernames[socket.id]);
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
    });
});

// Start the HTTP server and listen on port 3000
server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
