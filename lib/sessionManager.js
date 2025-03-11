const { 
    useMultiFileAuthState,
    makeWASocket,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require("@whiskeysockets/baileys")
const pino = require("pino")
const NodeCache = require("node-cache")
const fs = require('fs')
const path = require('path')
const qrcode = require('qrcode-terminal')

class SessionManager {
    constructor(store) {
        this.store = store;
        this.sessions = new Map();
    }

    async createSession(botId, sessionName = "KNIGHT BOT", ownerNumber = "", qrCallback, connectedCallback) {
        try {
            const existingSession = this.sessions.get(botId);
            if (existingSession) {
                console.log(`Session ${botId} already exists`);
                return existingSession;
            }

            const sessionDir = path.join(process.cwd(), 'bot-sessions', botId);
            const configPath = path.join(sessionDir, 'config.json');
            const configFolder = path.join(sessionDir, 'config');
            const ownerPath = path.join(configFolder, 'owner.json');
            
            // Ensure config directory exists
            if (!fs.existsSync(configFolder)) {
                fs.mkdirSync(configFolder, { recursive: true });
            }

            const connectToWhatsApp = async (retries = 0) => {
                try {
                    const { version } = await fetchLatestBaileysVersion();
                    
                    // Create a temporary auth state - only save permanently after successful connection
                    let state, saveCreds;
                    if (fs.existsSync(sessionDir)) {
                        // Use existing auth if available
                        ({ state, saveCreds } = await useMultiFileAuthState(sessionDir));
                    } else {
                        // Create temporary auth state in memory
                        ({ state, saveCreds } = await useMultiFileAuthState(sessionDir));
                    }
                    
                    const msgRetryCounterCache = new NodeCache();

                    const waSocket = makeWASocket({
                        version,
                        logger: pino({ level: 'silent' }),
                        printQRInTerminal: false,
                        qrTimeout: 60000,
                        browser: [sessionName, 'Chrome', '3.0'],
                        auth: {
                            creds: state.creds,
                            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                        },
                        markOnlineOnConnect: true,
                        generateHighQualityLinkPreview: true,
                        getMessage: async (key) => {
                            let jid = key.remoteJid
                            let msg = await this.store.loadMessage(jid, key.id)
                            return msg?.message || ""
                        },
                        msgRetryCounterCache,
                        defaultQueryTimeoutMs: 60000,
                        connectTimeoutMs: 60000,
                        retryRequestDelayMs: 2000
                    });

                    this.store.bind(waSocket.ev);

                    waSocket.ev.on('connection.update', async (update) => {
                        const { connection, lastDisconnect, qr } = update;
                        
                        if(qr) {
                            console.log('\n╭══════════════════════════╮');
                            console.log(`│ SCAN QR CODE - ${sessionName.slice(0, 10).padEnd(10)} │`);
                            console.log('╰══════════════════════════╯\n');
                            qrcode.generate(qr, { small: true });
                            console.log(`\nBot ID: ${botId}`);
                            console.log(`Session Name: ${sessionName}`);
                            qrCallback && qrCallback(qr);
                        }

                        if(connection === 'close') {
                            const statusCode = lastDisconnect?.error?.output?.statusCode;
                            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                            console.log('Connection closed. Status code:', statusCode);
                            
                            if(shouldReconnect && retries < 3) {
                                console.log(`Reconnecting... (Attempt ${retries + 1}/3)`);
                                setTimeout(async () => {
                                    await connectToWhatsApp(retries + 1);
                                }, 3000); // Wait 3 seconds before reconnecting
                            } else if(!shouldReconnect) {
                                console.log('Session logged out, please scan QR again');
                                await this.deleteSession(botId);
                            } else {
                                console.log('Max retries reached, please restart manually');
                            }
                        }

                        if(connection === 'open') {
                            // Now that the connection is successful, ensure the session directory exists
                            if (!fs.existsSync(sessionDir)) {
                                fs.mkdirSync(sessionDir, { recursive: true });
                            }

                            if (!fs.existsSync(configFolder)) {
                                fs.mkdirSync(configFolder, { recursive: true });
                            }

                            // Save session config after successful connection
                            const sessionConfig = {
                                name: sessionName,
                                ownerNumber: ownerNumber,  // Save ownerNumber in config
                                createdAt: new Date().toISOString()
                            };
                            fs.writeFileSync(configPath, JSON.stringify(sessionConfig, null, 2));

                            // Save owner number to owner.json
                            const ownerArray = ownerNumber ? [ownerNumber] : [];
                            fs.writeFileSync(ownerPath, JSON.stringify(ownerArray, null, 2));

                            console.log('\n╭══════════════════════════╮');
                            console.log('│    CONNECTION SUCCESS    │');
                            console.log('╰══════════════════════════╯');
                            console.log(`\nBot ${botId} connected successfully!`);
                            console.log(`Owner Number: ${ownerNumber || "Not set"}`);
                            connectedCallback && connectedCallback(waSocket);
                        }
                    });

                    waSocket.ev.on('creds.update', saveCreds);
                    this.sessions.set(botId, waSocket);
                    return waSocket;

                } catch (error) {
                    console.error('Connection error:', error);
                    if(retries < 3) {
                        console.log(`Retrying connection... (${retries + 1}/3)`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        return connectToWhatsApp(retries + 1);
                    }
                    throw error;
                }
            };

            return await connectToWhatsApp();

        } catch (error) {
            console.error('Session creation error:', error);
            throw error;
        }
    }

    getSession(botId) {
        return this.sessions.get(botId);
    }

    async deleteSession(botId) {
        const session = this.sessions.get(botId);
        if (session) {
            await session.logout();
            this.sessions.delete(botId);
            
            // Delete session files
            const sessionDir = path.join(process.cwd(), 'bot-sessions', botId);
            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }
            return true;
        }
        return false;
    }

    // Add method to get session name
    getSessionName(botId) {
        try {
            const configPath = path.join(process.cwd(), 'bot-sessions', botId, 'config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath));
                return config.name;
            }
            return null;
        } catch (error) {
            console.error('Error getting session name:', error);
            return null;
        }
    }

    // Add method to update session name
    async updateSessionName(botId, newName) {
        try {
            const configPath = path.join(process.cwd(), 'bot-sessions', botId, 'config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath));
                config.name = newName;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                
                // Update browser name in active session if exists
                const session = this.sessions.get(botId);
                if (session) {
                    session.authState.creds.browser = [newName, 'Chrome', '3.0'];
                }
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error updating session name:', error);
            return false;
        }
    }
}

module.exports = SessionManager;