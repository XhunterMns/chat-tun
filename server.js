const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let users = [];
let pairs = {};
let usernames = {};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('setUsername', (username) => {
        usernames[socket.id] = username;
        users.push(socket.id);

        if (users.length >= 2) {
            const [user1, user2] = users.splice(0, 2);
            pairs[user1] = user2;
            pairs[user2] = user1;
            io.to(user1).emit('matched', usernames[user2]);
            io.to(user2).emit('matched', usernames[user1]);
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
        }
        delete pairs[socket.id];
        delete pairs[partner];
        users.push(socket.id);

        if (users.length >= 2) {
            const [user1, user2] = users.splice(0, 2);
            pairs[user1] = user2;
            pairs[user2] = user1;
            io.to(user1).emit('matched', usernames[user2]);
            io.to(user2).emit('matched', usernames[user1]);
        }
    });

    socket.on('disconnect', () => {
        const partner = pairs[socket.id];
        if (partner) {
            io.to(partner).emit('userDisconnected', usernames[socket.id]);
        }
        users = users.filter((id) => id !== socket.id);
        delete pairs[socket.id];
        delete usernames[socket.id];
        console.log('A user disconnected:', socket.id);
    });
});

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
