const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

// Routes
app.use('/', routes); // Changed from /api to / 

// Create bot-sessions directory if not exists
const sessionsDir = path.join(__dirname, '../bot-sessions');
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
}

// Socket connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Handle QR code request
    socket.on('requestQR', async (data) => {
        try {
            const { startBot } = require('../index');
            const botId = data;

            // Validate botId
            if (!botId) {
                throw new Error('Bot ID is required');
            }

            // Create bot directory structure
            const botDir = path.join(__dirname, '../bot-sessions', botId);
            const configDir = path.join(botDir, 'config');
            fs.mkdirSync(configDir, { recursive: true });

            const qrCallback = (qr) => {
                socket.emit('qr', { botId, qr });
            };
            
            const connectedCallback = () => {
                socket.emit('connected', { botId, status: 'connected' });
            };

            await startBot(botId, qrCallback, connectedCallback);
            
        } catch (error) {
            console.error('Error starting bot:', error);
            socket.emit('error', { error: error.message });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});