const settings = require('../settings');
const fs = require('fs');

function getOwnerNumber() {
    const sessionName = process.argv[3] || 'default';
    try {
        return JSON.parse(fs.readFileSync(`./bot-sessions/${sessionName}/owner.json`));
    } catch (error) {
        return settings.ownerNumber;
    }
}

async function ownerCommand(sock, chatId) {
    const ownerNumber = getOwnerNumber();
    const ownerName = settings.botOwner || 'Owner Bot';
    
    const vcard = `
BEGIN:VCARD
VERSION:3.0
FN:${ownerName}
TEL;waid=${ownerNumber}:${ownerNumber}
END:VCARD
`;

    await sock.sendMessage(chatId, {
        contacts: { displayName: ownerName, contacts: [{ vcard }] },
    });
}

module.exports = ownerCommand;
