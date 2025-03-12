/**
 * Knight Bot - A WhatsApp Bot
 * Copyright (c) 2024 Professor
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 * 
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const { 
    default: makeWASocket,
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    makeInMemoryStore,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
const pino = require("pino")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync } = require('fs')
const { join } = require('path')
const crypto = require('crypto')

global.crypto = require('crypto')

const store = makeInMemoryStore({
    logger: pino().child({
        level: 'silent',
        stream: 'store'
    })
})

let phoneNumber = "911234567890"
let owner = JSON.parse(fs.readFileSync('./database/owner.json'))

global.botname = "KNIGHT BOT"
global.themeemoji = "•"

// Tambahkan deteksi flag pairing-qr
const pairingQR = process.argv.includes("--pairing-qr")
const useMobile = process.argv.includes("--mobile")

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text) => new Promise((resolve) => rl.question(text, resolve))

// Tambahkan fungsi untuk memastikan folder bot-sessions ada
const BOT_SESSIONS_DIR = './bot-sessions'
if (!existsSync(BOT_SESSIONS_DIR)) {
    fs.mkdirSync(BOT_SESSIONS_DIR)
}

// Parse command line arguments
const args = process.argv.slice(2)
const isQR = args[0] === '--qr'
const isRun = args[0] === '--run'
const sessionName = args[1]

// Validasi arguments
if ((isQR || isRun) && !sessionName) {
    console.log(chalk.red('Error: Nama bot harus ditentukan!'))
    console.log(chalk.yellow('\nCara penggunaan:'))
    console.log(chalk.cyan('1. Membuat session baru: node index.js --qr <namabot>'))
    console.log(chalk.cyan('2. Menjalankan bot: node index.js --run <namabot>'))
    process.exit(1)
}

async function askLoginMethod() {
    console.log(chalk.cyan('================================='))
    console.log(chalk.yellow('Pilih metode login:'))
    console.log(chalk.cyan('================================='))
    console.log(chalk.white('1. Pairing Code'))
    console.log(chalk.white('2. QR Code'))
    const choice = await question(chalk.green('Pilih nomor (1/2): '))
    return choice.trim()
}

async function startXeonBotInc() {
    // Jika tidak ada argument yang valid, tampilkan bantuan
    if (!isQR && !isRun) {
        console.log(chalk.yellow('\nCara penggunaan:'))
        console.log(chalk.cyan('1. Membuat session baru: node index.js --qr <namabot>'))
        console.log(chalk.cyan('2. Menjalankan bot: node index.js --run <namabot>'))
        console.log(chalk.cyan('\nSession yang tersedia:'))
        
        const sessions = fs.readdirSync(BOT_SESSIONS_DIR)
        if (sessions.length === 0) {
            console.log(chalk.red('Belum ada session tersimpan'))
        } else {
            sessions.forEach(session => {
                console.log(chalk.green(`- ${session}`))
            })
        }
        process.exit(0)
    }

    let { version, isLatest } = await fetchLatestBaileysVersion()
    const sessionPath = `${BOT_SESSIONS_DIR}/${sessionName}`

    // Jika mode run, cek apakah session ada
    if (isRun && !existsSync(sessionPath)) {
        console.log(chalk.red(`Error: Session '${sessionName}' tidak ditemukan!`))
        console.log(chalk.yellow('Buat session baru dengan perintah:'))
        console.log(chalk.cyan(`node index.js --qr ${sessionName}`))
        process.exit(1)
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
    const msgRetryCounterCache = new NodeCache()

    const XeonBotInc = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true, // Selalu true untuk menampilkan QR
        browser: ["Chrome (Linux)", "", ""],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => {
            let jid = jidNormalizedUser(key.remoteJid)
            let msg = await store.loadMessage(jid, key.id)
            return msg?.message || ""
        },
        msgRetryCounterCache,
        defaultQueryTimeoutMs: 60000,
    })

    store.bind(XeonBotInc.ev)

    // Connection handling dengan penanganan QR
    XeonBotInc.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update
        
        if (isQR) {
            // Mode pembuatan session baru
            if (connection === 'open') {
                console.log(chalk.green(`\n✅ Session berhasil dibuat: ${sessionName}`))
                console.log(chalk.yellow('\nUntuk menjalankan bot, gunakan perintah:'))
                console.log(chalk.cyan(`node index.js --run ${sessionName}`))
                process.exit(0)
            }
        } else {
            // Mode menjalankan bot
            if (connection === "open") {
                console.log(chalk.yellow(`\n🤖 Bot ${sessionName} berhasil terkoneksi!`))
                console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))
                
                const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                await XeonBotInc.sendMessage(botNumber, { 
                    text: `🤖 Bot Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!`
                });

                await delay(1999)
                console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname || 'KNIGHT BOT'} ]`)}\n\n`))
                console.log(chalk.cyan(`< ================================================== >`))
                console.log(chalk.magenta(`\n${global.themeemoji || '•'} YT CHANNEL: MR UNIQUE HACKER`))
                console.log(chalk.magenta(`${global.themeemoji || '•'} GITHUB: mrunqiuehacker`))
                console.log(chalk.magenta(`${global.themeemoji || '•'} WA NUMBER: ${owner}`))
                console.log(chalk.magenta(`${global.themeemoji || '•'} CREDIT: MR UNIQUE HACKER`))
                console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot Connected Successfully! ✅`))
            }
        }

        if (connection === "close") {
            let reason = new Boom(lastDisconnect?.error)?.output?.statusCode
            if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.red(`Device Logged Out, Please Delete ${sessionPath} and Scan Again.`))
                process.exit()
            } else {
                startXeonBotInc()
            }
        }
    })

    // Credentials update
    XeonBotInc.ev.on('creds.update', saveCreds)
    
    // Langsung tambahkan event handlers
    XeonBotInc.ev.on('messages.upsert', async (messageUpdate) => {
        await handleMessages(XeonBotInc, messageUpdate, true);
    });

    XeonBotInc.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(XeonBotInc, update);
    });

    XeonBotInc.ev.on('status.update', async (status) => {
        await handleStatus(XeonBotInc, status); 
    });

    return XeonBotInc
}


// Start the bot with error handling
startXeonBotInc().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
})

// Better error handling
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
    // Don't exit immediately to allow reconnection
})

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err)
    // Don't exit immediately to allow reconnection
})

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})