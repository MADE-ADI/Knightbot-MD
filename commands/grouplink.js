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
 * Command to get the invite link of the current group
 * @param {Object} sock - Socket connection
 * @param {String} chatId - Chat ID
 * @param {String} senderId - Sender ID
 */
async function grouplinkCommand(sock, chatId, senderId) {
    try {
        // Check if this is a group chat
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { 
                text: '❌ This command can only be used in groups.',
                ...channelInfo
            });
            return;
        }

        // Check if sender is an admin or bot owner
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
        
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { 
                text: '❌ Only group admins can use this command.',
                ...channelInfo
            });
            return;
        }

        // Check if bot is admin (required to generate invite links)
        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { 
                text: '❌ Bot must be an admin to generate invite links.',
                ...channelInfo
            });
            return;
        }

        await sock.sendMessage(chatId, { 
            text: '⏳ Generating group invite link...',
            ...channelInfo
        });

        try {
            // Get group metadata
            const groupMetadata = await sock.groupMetadata(chatId);
            const groupName = groupMetadata.subject;
            const participantCount = groupMetadata.participants.length;

            // Generate the invite code
            const inviteCode = await sock.groupInviteCode(chatId);
            
            if (!inviteCode) {
                throw new Error('Failed to generate invite code');
            }
            
            // Create the full invite link
            const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
            
            // Send the invite link with group information
            await sock.sendMessage(chatId, { 
                text: `📢 *Group Invite Link*\n\n*Group Name:* ${groupName}\n*Members:* ${participantCount}\n\n*Link:* ${inviteLink}\n\n_Share this link with people you want to invite to this group._`,
                ...channelInfo
            });

        } catch (error) {
            throw new Error(`Failed to generate invite link: ${error.message}`);
        }

    } catch (error) {
        console.error('Error getting group link:', error);
        await sock.sendMessage(chatId, { 
            text: `❌ Error: ${error.message}`,
            ...channelInfo
        });
    }
}

module.exports = grouplinkCommand;