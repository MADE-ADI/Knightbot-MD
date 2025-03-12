console.log('Node.js version:', process.version);
try {
    const crypto = require('crypto');
    console.log('Crypto module available:', !!crypto);
    console.log('Crypto functions:', Object.keys(crypto));
    
    // Test crypto functionality
    const hash = crypto.createHash('sha256');
    hash.update('test');
    console.log('Crypto test hash:', hash.digest('hex'));
} catch (e) {
    console.error('Crypto module error:', e);
}

const { makeInMemoryStore } = require('@whiskeysockets/baileys')
const pino = require('pino')
const SessionManager = require('./lib/sessionManager')
const express = require('express')
const qrcode = require('qrcode')
const { v4: uuidv4 } = require('uuid')
const path = require('path')
const fs = require('fs')
const bodyParser = require('express');

// Tambahkan konfigurasi global untuk crypto
global.crypto = require('crypto');

const store = makeInMemoryStore({
    
    logger: pino().child({
        level: 'silent',
        stream: 'store'
    })
})


const sessionManager = new SessionManager(store);
const botEvents = sessionManager.getEvents();

// Create Express app
const app = express();
const port = process.env.PORT || 8083;

// Setup static directory for QR codes
const qrcodesDir = path.join(__dirname, 'qrcodes');
if (!fs.existsSync(qrcodesDir)) {
    fs.mkdirSync(qrcodesDir);
}
app.use('/qrcodes', express.static('qrcodes'));
app.use(bodyParser.json());

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.post('/start-bot', async (req, res) => {
    const botId = req.body.sessionName;
    const sessionName = req.body.sessionName || "KNIGHT BOT";
    const ownerNumber = req.body.ownerNumber || "";
    
    try {
        console.log(`Starting new bot session: ${botId}`);
        
        // Hapus QR code lama jika ada
        const qrFileName = `qr-${botId}.png`;
        const qrImagePath = path.join(qrcodesDir, qrFileName);
        if (fs.existsSync(qrImagePath)) {
            fs.unlinkSync(qrImagePath);
        }

        let responseHandler = {
            sent: false,
            send: function(data) {
                if (!this.sent && !res.headersSent) {
                    this.sent = true;
                    res.json(data);
                }
            }
        };
        
        const socket = await sessionManager.createSession(
            botId,
            sessionName,
            ownerNumber,
            async (qr) => {
                try {
                    await qrcode.toFile(qrImagePath, qr, {
                        errorCorrectionLevel: 'H',
                        margin: 1,
                        scale: 8
                    });
                    
                    responseHandler.send({ 
                        success: true, 
                        qrPath: `/qrcodes/${qrFileName}`,
                        botId: botId 
                    });
                } catch (err) {
                    console.error('QR generation error:', err);
                    responseHandler.send({ 
                        success: false, 
                        error: 'Failed to generate QR code'
                    });
                }
            },
            (socket) => {
                console.log(`Bot ${botId} connected successfully!`);
                // Hapus QR code setelah terkoneksi
                if (fs.existsSync(qrImagePath)) {
                    fs.unlinkSync(qrImagePath);
                }
                botEvents.emit('connection-success', botId);
                
                // Jika response belum dikirim, kirim success message
                responseHandler.send({ 
                    success: true, 
                    message: 'Bot connected successfully',
                    botId: botId 
                });
            }
        );

        // Jika tidak ada response dalam 5 detik, kirim pesan waiting
        setTimeout(() => {
            responseHandler.send({ 
                success: true, 
                message: 'Waiting for QR code or connection...',
                botId: botId 
            });
        }, 5000);

    } catch (error) {
        console.error('Error starting bot:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }
});

app.get('/list-bots', async (req, res) => {
    try {
        const botsDir = path.join(process.cwd(), 'bot-sessions');
        if (!fs.existsSync(botsDir)) {
            return res.json([]);
        }

        const bots = fs.readdirSync(botsDir)
            .filter(file => fs.statSync(path.join(botsDir, file)).isDirectory())
            .map(botId => {
                const status = sessionManager.getSession(botId) ? 'active' : 'offline';
                return { name: botId, status };
            });

        res.json(bots);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/bot-action', async (req, res) => {
    const { action, botName } = req.body;
    
    try {
        switch (action) {
            case 'start':
                await sessionManager.createSession(botName, botName);
                break;
            case 'stop':
                await sessionManager.deleteSession(botName);
                break;
            case 'delete':
                await sessionManager.deleteSession(botName);
                const sessionDir = path.join(process.cwd(), 'bot-sessions', botName);
                if (fs.existsSync(sessionDir)) {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                }
                break;
            default:
                return res.status(400).json({ error: 'Invalid action' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Tambahkan endpoint untuk memeriksa status koneksi
app.get('/check-connection/:botId', (req, res) => {
    const { botId } = req.params;
    const isConnected = sessionManager.isConnected(botId);
    res.json({ connected: isConnected });
});

// Endpoint untuk long polling koneksi
app.get('/wait-connection/:botId', (req, res) => {
    const { botId } = req.params;
    
    // Jika sudah terhubung, langsung kirim respons
    if (sessionManager.isConnected(botId)) {
        return res.json({ connected: true });
    }
    
    // Set timeout untuk long polling (30 detik)
    const timeout = setTimeout(() => {
        botEvents.removeListener('connection-success', connectionHandler);
        res.json({ connected: false, timeout: true });
    }, 30000);
    
    // Handler untuk event koneksi
    const connectionHandler = (connectedBotId) => {
        if (connectedBotId === botId) {
            clearTimeout(timeout);
            botEvents.removeListener('connection-success', connectionHandler);
            res.json({ connected: true });
        }
    };
    
    // Daftarkan listener
    botEvents.on('connection-success', connectionHandler);
});

// Tambahkan endpoint untuk update owner number
app.post('/update-owner/:botId', async (req, res) => {
    const { botId } = req.params;
    const { ownerNumber } = req.body;
    
    try {
        const updated = await sessionManager.updateOwnerNumber(botId, ownerNumber);
        if (updated) {
            res.json({ success: true });
        } else {
            res.status(404).json({ 
                success: false, 
                error: 'Bot not found or update failed' 
            });
        }
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Start server
app.listen(port, () => {
    console.log(`WhatsApp Bot Manager running at http://localhost:${port}`);
});