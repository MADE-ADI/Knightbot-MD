const express = require('express');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { startBot } = require('./index');

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from 'qrcodes' directory
app.use('/qrcodes', express.static('qrcodes'));

// Create qrcodes directory if it doesn't exist
const qrcodesDir = path.join(__dirname, 'qrcodes');
if (!fs.existsSync(qrcodesDir)) {
    fs.mkdirSync(qrcodesDir);
}

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>WhatsApp QR Code</title>
                <style>
                    /* ...existing styles... */
                </style>
            </head>
            <body>
                <h1>WhatsApp Bot QR Scanner</h1>
                <button onclick="startBot()">Start New Bot</button>
                <div id="qrcode"></div>
                <div class="status">Click Start New Bot to begin</div>

                <script>
                async function startBot() {
                    try {
                        document.querySelector('.status').textContent = 'Starting bot...';
                        const response = await fetch('/start-bot');
                        const data = await response.json();
                        
                        if (data.success) {
                            document.querySelector('#qrcode').innerHTML = 
                                '<img src="' + data.qrPath + '?' + new Date().getTime() + '" alt="QR Code">';
                            document.querySelector('.status').textContent = 'Scan QR Code with WhatsApp';
                        }
                    } catch (error) {
                        document.querySelector('.status').textContent = 'Error: ' + error.message;
                    }
                }
                </script>
            </body>
        </html>
    `);
});

app.get('/start-bot', async (req, res) => {
    const botId = uuidv4();
    let qrImagePath = null;
    let qrSent = false;
    let responseTimeout;

    try {
        // Set 30 second timeout for QR generation
        responseTimeout = setTimeout(() => {
            if (!qrSent) {
                res.status(408).json({ 
                    success: false, 
                    error: 'QR code generation timeout' 
                });
            }
        }, 30000);

        const bot = await startBot(
            botId,
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
                    clearTimeout(responseTimeout);
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
            () => {
                console.log(`Bot ${botId} connected successfully!`);
                if (qrImagePath && fs.existsSync(qrImagePath)) {
                    fs.unlinkSync(qrImagePath);
                }
            }
        );
    } catch (error) {
        clearTimeout(responseTimeout);
        console.error('Error starting bot:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }
});

app.listen(port, () => {
    console.log(`QR Server running at http://localhost:${port}`);
});