const { makeInMemoryStore } = require('@whiskeysockets/baileys')
const pino = require('pino')
const SessionManager = require('./lib/sessionManager')
const express = require('express')
const qrcode = require('qrcode')
const { v4: uuidv4 } = require('uuid')
const path = require('path')
const fs = require('fs')
const bodyParser = require('express');

const store = makeInMemoryStore({
    logger: pino().child({
        level: 'silent',
        stream: 'store'
    })
})


const sessionManager = new SessionManager(store);

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

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
    const ownerNumber = req.body.ownerNumber || "";  // Ambil ownerNumber dari request
    let qrImagePath = null;
    let qrSent = false;

    try {
        await sessionManager.createSession(
            botId,
            sessionName,
            ownerNumber,  // Tambahkan ownerNumber sebagai parameter
            // QR callback
            async (qr) => {
                if (qrSent) return;
                
                try {
                    const qrFileName = `qr-${botId}.png`;
                    qrImagePath = path.join(qrcodesDir, qrFileName);
                    
                    await qrcode.toFile(qrImagePath, qr, {
                        errorCorrectionLevel: 'H',
                        margin: 1,
                        scale: 8
                    });
                    
                    qrSent = true;
                    res.json({ 
                        success: true, 
                        qrPath: `/qrcodes/${qrFileName}`,
                        botId: botId 
                    });
                } catch (err) {
                    console.error('QR generation error:', err);
                    if (!res.headersSent) {
                        res.status(500).json({ 
                            success: false, 
                            error: 'Failed to generate QR code' 
                        });
                    }
                }
            },
            // Connected callback
            (socket) => {
                console.log(`Bot ${botId} connected successfully!`);
                if (qrImagePath && fs.existsSync(qrImagePath)) {
                    fs.unlinkSync(qrImagePath);
                }
            }
        );
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

// Start server
app.listen(port, () => {
    console.log(`WhatsApp Bot Manager running at http://localhost:${port}`);
});