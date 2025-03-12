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

// Tambahkan variabel untuk tracking status koneksi
let isFullyConnected = false;
let hasCredentialsSaved = false;

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
    // Tampilkan bantuan jika tidak ada argumen
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

    // Set path session berdasarkan nama bot
    const sessionPath = `${BOT_SESSIONS_DIR}/${sessionName}`

    // Tambahkan logging untuk debugging
    console.log(chalk.yellow('\nMemulai bot...'))
    console.log(chalk.cyan(`Mode: ${isQR ? 'QR Code' : 'Run'}`))
    console.log(chalk.cyan(`Session: ${sessionName}`))
    console.log(chalk.cyan(`Path: ${sessionPath}`))

    // Inisialisasi session
    let state, saveCreds
    try {
        console.log(chalk.yellow('Memuat session...'))
        const authResult = await useMultiFileAuthState(sessionPath)
        state = authResult.state
        saveCreds = authResult.saveCreds
        
        console.log(chalk.green('Session berhasil dimuat!'))
    } catch (error) {
        console.error(chalk.red('Error saat memuat session:'), error)
        if (isRun) {
            console.log(chalk.yellow('Session tidak valid, menampilkan QR code untuk login...'))
        }
        // Buat directory jika belum ada
        if (!existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true })
        }
        const authResult = await useMultiFileAuthState(sessionPath)
        state = authResult.state
        saveCreds = authResult.saveCreds
    }

    // Buat koneksi WhatsApp
    const XeonBotInc = makeWASocket({
        version: (await fetchLatestBaileysVersion()).version,
        logger: pino({ level: 'debug' }),
        printQRInTerminal: true, // Selalu tampilkan QR jika diperlukan
        auth: state,
        browser: ['Chrome (Linux)', '', ''],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
    })

    console.log(chalk.yellow('Mencoba terhubung ke WhatsApp...'))

    store.bind(XeonBotInc.ev)

    // Perbaikan connection handler
    XeonBotInc.ev.on('connection.update', async (update) => {
        console.log(chalk.cyan('Connection update:', JSON.stringify(update, null, 2)))
        const { connection, lastDisconnect } = update

        if (connection === 'open') {
            isFullyConnected = true;
            const { id, name } = XeonBotInc.user
            console.log(chalk.green('\n✅ Bot berhasil terhubung!'))
            console.log(chalk.yellow('Bot Info:'))
            console.log(chalk.cyan(`› Nama    : ${name}`))
            console.log(chalk.cyan(`› Number  : ${id.split(':')[0]}`))
            console.log(chalk.cyan(`› Status  : Online`))
            console.log(chalk.cyan(`› Session : ${sessionName}`))
            console.log(chalk.yellow('\nBot sudah siap digunakan!'))
            console.log(chalk.cyan('Ketik .menu untuk melihat daftar perintah\n'))

            // Set bot status
            await XeonBotInc.sendPresenceUpdate('available')
            await XeonBotInc.updateProfileStatus(`Bot aktif | Runtime: ${process.uptime()} detik`)
            
        } else if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut && 
                                  statusCode !== 401 &&
                                  reconnectAttempt < maxReconnectAttempts

            if (shouldReconnect) {
                reconnectAttempt++
                console.log(chalk.yellow(`\nKoneksi terputus, mencoba menghubungkan ulang (${reconnectAttempt}/${maxReconnectAttempts})...`))
                
                await new Promise(resolve => setTimeout(resolve, 3000))
                startXeonBotInc()
            } else {
                // Jika session tidak valid, kita tidak perlu menghapusnya
                // karena QR code akan ditampilkan untuk login ulang
                console.log(chalk.yellow('\nSilakan scan QR code untuk login ulang...'))
            }
        }
    })

    // Perbaikan credentials handler
    XeonBotInc.ev.on('creds.update', async () => {
        try {
            await saveCreds()
            hasCredentialsSaved = true;
            console.log(chalk.green('✓ Credentials diperbarui'))
            
            // Jika dalam mode QR dan sudah fully connected, tunggu credentials tersimpan
            if (isQR && isFullyConnected && hasCredentialsSaved) {
                // Tunggu 3 detik untuk memastikan semua proses selesai
                await new Promise(resolve => setTimeout(resolve, 3000))
                
                console.log(chalk.green('\n✅ Session berhasil dibuat dan tersimpan!'))
                console.log(chalk.yellow('Session tersimpan di:'), chalk.cyan(sessionPath))
                console.log(chalk.yellow('\nJalankan bot dengan perintah:'))
                console.log(chalk.cyan(`node index.js --run ${sessionName}\n`))
                process.exit(0)
            }
        } catch (error) {
            console.error('Error menyimpan credentials:', error)
            if (isQR) {
                console.log(chalk.red('\nGagal menyimpan session! Silakan coba lagi.'))
                process.exit(1)
            }
        }
    })

    // Tambahkan message handler dari main.js
    XeonBotInc.ev.on('messages.upsert', async (m) => {
        if (!isRun) return // Skip jika bukan mode run
        await handleMessages(XeonBotInc, m, true)
    })

    // Tambahkan group participant handler dari main.js  
    XeonBotInc.ev.on('group-participants.update', async (update) => {
        if (!isRun) return
        await handleGroupParticipantUpdate(XeonBotInc, update)
    })

    // Tambahkan status handler dari main.js
    XeonBotInc.ev.on('presence.update', async (status) => {
        if (!isRun) return
        await handleStatus(XeonBotInc, status) 
    })
    

    // Tambahkan handler untuk memastikan koneksi stabil
    XeonBotInc.ev.on('messages.upsert', async () => {
        if (isQR) return // Skip jika mode QR
        reconnectAttempt = 0 // Reset reconnect counter saat ada aktivitas
    })

    return XeonBotInc
}

// Tambahkan fungsi untuk format waktu
function runtime(seconds) {
    const hours = Math.floor(seconds / (60 * 60))
    const minutes = Math.floor((seconds % (60 * 60)) / 60)
    const secs = Math.floor(seconds % 60)
    return `${hours}h ${minutes}m ${secs}s`
}

// Error handlers dengan detail
process.on('uncaughtException', (err) => {
    console.error(chalk.red('Uncaught Exception:'), err)
})

process.on('unhandledRejection', (err) => {
    console.error(chalk.red('Unhandled Rejection:'), err)
})

// Tambahkan signal handlers
process.on('SIGINT', async () => {
    console.log(chalk.yellow('\nMematikan bot...'))
    if (fs.existsSync(sessionPath) && !isQR) {
        await new Promise(resolve => setTimeout(resolve, 1000))
    }
    process.exit(0)
})

// Jalankan bot dengan logging
console.log(chalk.green('\nMemulai Knight Bot...'))
startXeonBotInc().catch(error => {
    console.error(chalk.red('\nFatal error:'), error)
    process.exit(1)
})

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})