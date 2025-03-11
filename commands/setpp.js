const fs = require('fs');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const path = require('path');
const isOwner = require('../helpers/isOwner');

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

async function setProfilePicCommand(sock, chatId, senderId, message) {
    try {
        // Check if sender is owner
        if (!isOwner(senderId)) {
            await sock.sendMessage(chatId, { 
                text: '❌ Only the bot owner can change the profile picture.',
                
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
                text: '❌ Please provide an image!\n\nUsage:\n- Send an image with caption .setpp\n- Reply to an image with .setpp',
                
            });
            return;
        }

        await sock.sendMessage(chatId, { 
            text: '⏳ Downloading image...',
            
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
        const tempFilePath = path.join(tempDir, 'profile-pic.jpeg');
        fs.writeFileSync(tempFilePath, buffer);

        await sock.sendMessage(chatId, { 
            text: '⏳ Updating profile picture...',
            
        });

        // Update profile picture using the file
        await sock.updateProfilePicture(sock.user.id, { url: tempFilePath });

        // Delete temporary file
        try {
            fs.unlinkSync(tempFilePath);
        } catch (error) {
            console.log('Error deleting temp file:', error);
            // Non-critical error, continue
        }

        await sock.sendMessage(chatId, { 
            text: '✅ Profile picture updated successfully!',
            
        });

    } catch (error) {
        console.error('Error updating profile picture:', error);
        
        let errorMessage = error.message;
        // Make error message more user-friendly
        if (error.message.includes('not a valid')) {
            errorMessage = 'The image format is not supported. Please try with a different image.';
        } else if (error.message.includes('axios')) {
            errorMessage = 'Network error while processing the image. Please try again.';
        }
        
        await sock.sendMessage(chatId, { 
            text: `❌ Failed to update profile picture: ${errorMessage}`,
            
        });
    }
}

module.exports = setProfilePicCommand;