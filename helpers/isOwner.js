const settings = require('../settings');
const fs = require('fs');

function getOwnerNumber() {
    // Ambil session name dari parameter ketiga (index 3)
    const sessionName = process.argv[3] || 'default';
    try {
        // Coba baca dari owner.json
        return JSON.parse(fs.readFileSync(`./bot-sessions/${sessionName}/owner.json`));
    } catch (error) {
        // Jika gagal, gunakan dari settings
        return settings.ownerNumber;
    }
}

const ownerNumber = getOwnerNumber();

function isOwner(senderId) {
    // Get owner number from settings
    const ownerJid = ownerNumber + "@s.whatsapp.net";
    console.log(ownerJid)
    return senderId === ownerJid;
}

module.exports = isOwner;