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

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Add user to the pool
    users.push(socket.id);

    // Match users when someone connects
    if (users.length >= 2) {
        const [user1, user2] = users.splice(0, 2);
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
        users.push(socket.id);
        io.emit('userSkipped', socket.id); // Emit an event to notify that the user skipped
        if (users.length >= 2) {
            const [user1, user2] = users.splice(0, 2);
            io.to(user1).emit('matched', user2);
            io.to(user2).emit('matched', user1);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        users = users.filter((id) => id !== socket.id);
        console.log('A user disconnected:', socket.id);
        io.emit('userDisconnected', socket.id); // Emit an event to notify that the user disconnected
    });
});

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
