const { makeInMemoryStore } = require('@whiskeysockets/baileys')
const pino = require('pino')
const SessionManager = require('./lib/sessionManager')

// Get session name from command line argument
const sessionName = process.argv[2];
if (!sessionName) {
    console.error('Session name is required');
    process.exit(1);
}

const store = makeInMemoryStore({
    logger: pino().child({
        level: 'silent',
        stream: 'store'
    })
})

const sessionManager = new SessionManager(store);

async function startBot() {
    try {
        const session = await sessionManager.createSession(
            sessionName,
            sessionName,
            // QR callback
            async (qr) => {
                console.log('New QR Code generated for session:', sessionName);
                // You can implement additional QR handling here if needed
            },
            // Connected callback
            (socket) => {
                console.log(`Bot ${sessionName} connected successfully!`);
            }
        );
    } catch (error) {
        console.error(`Error starting bot ${sessionName}:`, error);
        process.exit(1);
    }
}

startBot();