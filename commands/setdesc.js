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
 * Command to set a WhatsApp group description
 * @param {Object} sock - Socket connection
 * @param {String} chatId - Chat ID
 * @param {String} senderId - Sender ID
 * @param {String} text - Message text containing the description
 */
async function setDescriptionCommand(sock, chatId, senderId, text) {
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
                text: '❌ Only group admins can change the group description.',
                ...channelInfo
            });
            return;
        }

        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { 
                text: '❌ Bot must be an admin to change the group description.',
                ...channelInfo
            });
            return;
        }

        // Extract description from message text
        // Remove command prefix (.setdesc or .desc)
        let description = '';
        if (text.startsWith('.setdesc')) {
            description = text.substring(8).trim();
        } else if (text.startsWith('.desc')) {
            description = text.substring(5).trim();
        } else if (text.startsWith('.setdescription')) {
            description = text.substring(15).trim();
        }

        // Check if a description was provided
        if (!description) {
            await sock.sendMessage(chatId, { 
                text: '❌ Please provide a description!\n\nUsage: *.setdesc* Your group description here',
                ...channelInfo
            });
            return;
        }

        await sock.sendMessage(chatId, { 
            text: '⏳ Updating group description...',
            ...channelInfo
        });

        // Update group description
        await sock.groupUpdateDescription(chatId, description);
        
        // Get group metadata for the group name
        const groupMetadata = await sock.groupMetadata(chatId);
        const groupName = groupMetadata.subject || "Group";

        await sock.sendMessage(chatId, { 
            text: `✅ Group description updated successfully!\n\n*Group:* ${groupName}\n\n*New Description:*\n${description}`,
            ...channelInfo
        });

    } catch (error) {
        console.error('Error updating group description:', error);
        
        let errorMessage = error.message;
        if (error.message.includes('not-authorized')) {
            errorMessage = 'Not authorized to change the group description. Please check if bot has admin privileges.';
        } else if (error.message.includes('5 seconds')) {
            errorMessage = 'Please wait 5 seconds before changing the description again.';
        }
        
        await sock.sendMessage(chatId, { 
            text: `❌ Failed to update group description: ${errorMessage}`,
            ...channelInfo
        });
    }
}

module.exports = setDescriptionCommand;