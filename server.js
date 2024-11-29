const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the project directory
app.use(express.static(path.join(__dirname)));

// Serve the index.html file for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let users = []; // Store active users
let pairs = {}; // Store matched user pairs

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Add user to the pool
    users.push(socket.id);

    // Match users when someone connects
    if (users.length >= 2) {
        const [user1, user2] = users.splice(0, 2);
        pairs[user1] = user2;  // Store the pair of users
        pairs[user2] = user1;
        io.to(user1).emit('matched', user2);
        io.to(user2).emit('matched', user1);
    }

    // Handle messaging
    socket.on('message', ({ to, message }) => {
        io.to(to).emit('message', { from: socket.id, message });
    });

    // Handle image sharing
    socket.on('image', ({ to, image }) => {
        io.to(to).emit('image', { from: socket.id, image });
    });

    // Handle skip
    socket.on('skip', () => {
        const partner = pairs[socket.id];
        if (partner) {
            // Emit skip message to both the users
            io.to(socket.id).emit('userSkipped', socket.id);  // Notify the user who skipped
            io.to(partner).emit('userSkipped', socket.id);  // Notify the partner about the skip
        }

        // Remove the pair and add the user back to the pool
        delete pairs[socket.id];
        delete pairs[partner];
        users.push(socket.id);

        // Match new users if possible
        if (users.length >= 2) {
            const [user1, user2] = users.splice(0, 2);
            pairs[user1] = user2;
            pairs[user2] = user1;
            io.to(user1).emit('matched', user2);
            io.to(user2).emit('matched', user1);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const partner = pairs[socket.id];

        if (partner) {
            // Emit disconnection message to the partner only
            io.to(partner).emit('userDisconnected', socket.id); // Notify the other user about the disconnection
        }

        // Remove the user from the pool and pair mapping
        users = users.filter((id) => id !== socket.id);
        delete pairs[socket.id];
        console.log('A user disconnected:', socket.id);
    });
});

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
