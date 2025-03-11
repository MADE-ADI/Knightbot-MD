const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const isAdmin = require('../helpers/isAdmin');

const channelInfo = {
    contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363161513685998@newsletter',
            newsletterName: 'KnightBot MD',
            serverMessageId: -1
        }
    }
};

/**
 * Command to set a group's profile picture
 * @param {Object} sock - Socket connection
 * @param {String} chatId - Chat ID
 * @param {String} senderId - Sender ID
 * @param {Object} message - Message object
 */
async function setGroupIconCommand(sock, chatId, senderId, message) {
    try {
        // Check if this is a group chat
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { 
                text: '❌ This command can only be used in groups.',
                ...channelInfo
            });
            return;
        }

        // Check if sender is admin
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
        
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { 
                text: '❌ Only group admins can change the group icon.',
                ...channelInfo
            });
            return;
        }

        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { 
                text: '❌ Please make the bot an admin to use this command.',
                ...channelInfo
            });
            return;
        }

        // Find the image message - either directly or in quoted message
        let imageMessage = message.message?.imageMessage;
        
        // If no direct image, check if it's a reply to an image
        if (!imageMessage && message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            imageMessage = message.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
        }

        if (!imageMessage) {
            await sock.sendMessage(chatId, { 
                text: '❌ Please provide an image!\n\nUsage:\n- Send an image with caption .setgroupicon\n- Reply to an image with .setgroupicon',
                ...channelInfo
            });
            return;
        }

        await sock.sendMessage(chatId, { 
            text: '⏳ Downloading image...',
            ...channelInfo
        });

        // Download the image using stream
        const stream = await downloadContentFromMessage(imageMessage, 'image');
        let buffer = Buffer.from([]);
        
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        // Ensure temp directory exists
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Save the image to a temporary file
        const tempFilePath = path.join(tempDir, `group-icon-${chatId.split('@')[0]}.jpeg`);
        fs.writeFileSync(tempFilePath, buffer);

        await sock.sendMessage(chatId, { 
            text: '⏳ Updating group icon...',
            ...channelInfo
        });

        // Update group profile picture
        await sock.updateProfilePicture(chatId, { url: tempFilePath });

        // Delete temporary file
        try {
            fs.unlinkSync(tempFilePath);
        } catch (error) {
            console.log('Error deleting temp file:', error);
            // Non-critical error, continue
        }

        await sock.sendMessage(chatId, { 
            text: '✅ Group icon updated successfully!',
            ...channelInfo
        });

    } catch (error) {
        console.error('Error updating group icon:', error);
        
        let errorMessage = error.message;
        // Make error message more user-friendly
        if (error.message.includes('not a valid')) {
            errorMessage = 'The image format is not supported. Please try with a different image.';
        } else if (error.message.includes('axios')) {
            errorMessage = 'Network error while processing the image. Please try again.';
        } else if (error.message.includes('not-authorized')) {
            errorMessage = 'Not authorized to change the group icon. Please check if bot has admin privileges.';
        }
        
        await sock.sendMessage(chatId, { 
            text: `❌ Failed to update group icon: ${errorMessage}`,
            ...channelInfo
        });
    }
}

module.exports = setGroupIconCommand;