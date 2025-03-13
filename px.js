const { Boom } = require('@hapi/boom');
const NodeCache = require('@cacheable/node-cache');
const readline = require('readline');
const makeWASocket = require('../src').default;
const open = require('open');
const fs = require('fs');
const P = require('pino');

const logger = P({ timestamp: () => `,"time":"${new Date().toJSON()}"` }, P.destination('./wa-logs.txt'));
logger.level = 'trace';

const doReplies = process.argv.includes('--do-reply');
const usePairingCode = process.argv.includes('--use-pairing-code');

const msgRetryCounterCache = new NodeCache();
const onDemandMap = new Map();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

const startSock = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: !usePairingCode,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        msgRetryCounterCache,
        generateHighQualityLinkPreview: true,
        getMessage,
    });

    if (usePairingCode && !sock.authState.creds.registered) {
        const phoneNumber = await question('Please enter your phone number:\n');
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`Pairing code: ${code}`);
    }

    const sendMessageWTyping = async (msg, jid) => {
        await sock.presenceSubscribe(jid);
        await delay(500);
        await sock.sendPresenceUpdate('composing', jid);
        await delay(2000);
        await sock.sendPresenceUpdate('paused', jid);
        await sock.sendMessage(jid, msg);
    };

    sock.ev.process(async (events) => {
        if (events['connection.update']) {
            const update = events['connection.update'];
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                if ((lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
                    startSock();
                } else {
                    console.log('Connection closed. You are logged out.');
                }
            }
            console.log('connection update', update);
        }

        if (events['creds.update']) {
            await saveCreds();
        }

        if (events['messages.upsert']) {
            const upsert = events['messages.upsert'];
            console.log('Received messages', JSON.stringify(upsert, null, 2));

            if (upsert.type === 'notify') {
                for (const msg of upsert.messages) {
                    if (!msg.key.fromMe && doReplies && !isJidNewsletter(msg.key?.remoteJid)) {
                        console.log('Replying to', msg.key.remoteJid);
                        await sock.readMessages([msg.key]);
                        await sendMessageWTyping({ text: 'Hello there!' }, msg.key.remoteJid);
                    }
                }
            }
        }
    });
};

startSock();
