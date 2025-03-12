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
const EventEmitter = require('events')

// Tambahkan ini untuk mengatasi masalah crypto
let crypto;
try {
    crypto = require('crypto');
} catch (err) {
    console.error('crypto support is disabled!');
}

class SessionManager {
    constructor(store) {
        this.store = store;
        this.sessions = new Map();
        this.events = new EventEmitter();
    }

    // Metode untuk mendapatkan event emitter
    getEvents() {
        return this.events;
    }

    // Metode untuk memeriksa apakah sesi terhubung
    isConnected(botId) {
        const session = this.sessions.get(botId);
        return session && session.user ? true : false;
    }

    async createSession(botId, sessionName = "KNIGHT BOT", ownerNumber = "", qrCallback, connectedCallback) {
        try {
            // Hapus session yang ada jika masih tersimpan di memory
            if (this.sessions.has(botId)) {
                await this.deleteSession(botId);
            }

            const sessionDir = path.join(process.cwd(), 'bot-sessions', botId);
            const configFolder = path.join(sessionDir, 'config');
            const ownerPath = path.join(configFolder, 'owner.json');
            
            // Buat direktori session dan config
            fs.mkdirSync(sessionDir, { recursive: true });
            fs.mkdirSync(configFolder, { recursive: true });
            
            // Buat file owner.json jika belum ada
            if (!fs.existsSync(ownerPath)) {
                fs.writeFileSync(ownerPath, JSON.stringify([], null, 2));
            }

            const connectToWhatsApp = async (retries = 0) => {
                try {
                    console.log(`Connecting WhatsApp for bot: ${botId} (Attempt ${retries + 1})`);
                    const { version } = await fetchLatestBaileysVersion();
                    
                    // Buat state baru
                    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
                    
                    const msgRetryCounterCache = new NodeCache();

                    const waSocket = makeWASocket({
                        version,
                        logger: pino({ level: 'silent' }),
                        printQRInTerminal: true,
                        qrTimeout: 60000,
                        browser: [sessionName, 'Safari', '3.0'],
                        auth: {
                            creds: state.creds,
                            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                        },
                        markOnlineOnConnect: true,
                        generateHighQualityLinkPreview: true,
                        getMessage: async (key) => {
                            let jid = key.remoteJid
                            let msg = await this.store.loadMessage(jid, key.id)
                            return msg?.message || ""
                        },
                        msgRetryCounterCache,
                        defaultQueryTimeoutMs: undefined
                    });

                    this.store.bind(waSocket.ev);

                    waSocket.ev.on('connection.update', async (update) => {
                        const { connection, lastDisconnect, qr } = update;
                        
                        console.log(`Connection update for ${botId}:`, update);
                        
                        if(qr) {
                            console.log('\n╭══════════════════════════╮');
                            console.log(`│ SCAN QR CODE - ${sessionName.slice(0, 10).padEnd(10)} │`);
                            console.log('╰══════════════════════════╯\n');
                            
                            qrcode.generate(qr, { small: true });
                            console.log(`\nBot ID: ${botId}`);
                            console.log(`Session Name: ${sessionName}`);
                            
                            qrCallback && qrCallback(qr);
                        }

                        if(connection === 'open') {
                            console.log('\n╭══════════════════════════╮');
                            console.log('│    CONNECTION SUCCESS    │');
                            console.log('╰══════════════════════════╯');
                            
                            // Pastikan folder config ada
                            if (!fs.existsSync(configFolder)) {
                                fs.mkdirSync(configFolder, { recursive: true });
                            }
                            
                            // Update owner.json
                            const ownerArray = ownerNumber ? [ownerNumber] : [];
                            fs.writeFileSync(ownerPath, JSON.stringify(ownerArray, null, 2));
                            
                            // Save session config
                            const configPath = path.join(sessionDir, 'config.json');
                            const sessionConfig = {
                                name: sessionName,
                                ownerNumber: ownerNumber,
                                createdAt: new Date().toISOString()
                            };
                            fs.writeFileSync(configPath, JSON.stringify(sessionConfig, null, 2));
                            
                            console.log(`\nBot ${botId} connected successfully!`);
                            console.log(`Owner Number: ${ownerNumber || "Not set"}`);
                            
                            this.events.emit('connection-success', botId);
                            connectedCallback && connectedCallback(waSocket);
                        }

                        if(connection === 'close') {
                            const statusCode = lastDisconnect?.error?.output?.statusCode;
                            console.log('Connection closed. Status code:', statusCode);
                            
                            if(statusCode === DisconnectReason.restartRequired) {
                                console.log("Restart required, reconnecting...");
                                await connectToWhatsApp(retries + 1);
                            } else if(statusCode === DisconnectReason.loggedOut) {
                                console.log("Device logged out, please scan again");
                                await this.deleteSession(botId);
                            } else if(retries < 3) {
                                console.log(`Reconnecting... (Attempt ${retries + 1}/3)`);
                                await connectToWhatsApp(retries + 1);
                            } else {
                                console.log("Max retries reached, please restart manually");
                            }
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
                    session.authState.creds.browser = [newName, 'Safari', '3.0'];
                }
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error updating session name:', error);
            return false;
        }
    }

    async updateOwnerNumber(botId, ownerNumber) {
        try {
            const sessionDir = path.join(process.cwd(), 'bot-sessions', botId);
            const configFolder = path.join(sessionDir, 'config');
            const ownerPath = path.join(configFolder, 'owner.json');
            
            if (!fs.existsSync(configFolder)) {
                fs.mkdirSync(configFolder, { recursive: true });
            }
            
            // Update owner.json
            const ownerArray = ownerNumber ? [ownerNumber] : [];
            fs.writeFileSync(ownerPath, JSON.stringify(ownerArray, null, 2));
            
            // Update config.json juga
            const configPath = path.join(sessionDir, 'config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath));
                config.ownerNumber = ownerNumber;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            }
            
            return true;
        } catch (error) {
            console.error('Error updating owner number:', error);
            return false;
        }
    }
}

module.exports = SessionManager;