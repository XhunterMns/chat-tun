const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors'); // Add CORS support

// Create app and server
const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.IO and Express
const io = new Server(server, {
  cors: {
    origin: "https://chahine2.vps.webdock.cloud",
    methods: ["GET", "POST"]
  }
});

// Enable CORS for Express
app.use(cors({
  origin: "https://chahine2.vps.webdock.cloud"
}));

// Serve static files from the 'public' directory (recommended)
app.use(express.static(path.join(__dirname, 'public')));

// Route for your chat application
app.get('/chat-tun', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Your existing Socket.IO logic remains the same
let users = [];
let pairs = {};
let usernames = {};
let userCount = 0;

io.on('connection', (socket) => {
    userCount++;
    io.emit('updateUserCount', userCount);
    console.log(`A user connected: ${socket.id}`);

    socket.on('setUsername', (username) => {
        usernames[socket.id] = username;
        users.push(socket.id);

        if (users.length >= 2) {
            const [user1, user2] = users.splice(0, 2);
            pairs[user1] = user2;
            pairs[user2] = user1;
            io.to(user1).emit('matched', { partnerSocketId: user2, partnerUsername: usernames[user2] });
            io.to(user2).emit('matched', { partnerSocketId: user1, partnerUsername: usernames[user1] });
        }
    });

    socket.on('message', ({ to, message }) => {
        io.to(to).emit('message', { from: usernames[socket.id], message });
    });

    socket.on('image', ({ to, image }) => {
        io.to(to).emit('image', { from: usernames[socket.id], image });
    });

    socket.on('skip', () => {
        const partner = pairs[socket.id];
        if (partner) {
            io.to(partner).emit('userSkipped', usernames[socket.id]);
            users.push(partner);
        }
        users.push(socket.id);
        delete pairs[socket.id];
        delete pairs[partner];

        if (users.length >= 2) {
            const [user1, user2] = users.splice(0, 2);
            pairs[user1] = user2;
            pairs[user2] = user1;
            io.to(user1).emit('matched', { partnerSocketId: user2, partnerUsername: usernames[user2] });
            io.to(user2).emit('matched', { partnerSocketId: user1, partnerUsername: usernames[user1] });
        }
    });

    socket.on('disconnect', () => {
        const partner = pairs[socket.id];
        if (partner) {
            io.to(partner).emit('userDisconnected', usernames[socket.id]);
            users.push(partner);
        }
        users = users.filter((id) => id !== socket.id);
        delete pairs[socket.id];
        delete pairs[partner];
        delete usernames[socket.id];
        userCount--;
        io.emit('updateUserCount', userCount);
        console.log(`A user disconnected: ${socket.id}`);
    });
});

// Start server on all network interfaces
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
