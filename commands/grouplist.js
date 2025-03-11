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

/**
 * Lists all groups the bot is a member of
 * @param {Object} sock - The socket connection
 * @param {String} chatId - The chat ID
 * @param {String} senderId - The sender's ID
 */
async function groupListCommand(sock, chatId, senderId) {
    try {
        // Security check - only owner can use this command
        if (!isOwner(senderId)) {
            await sock.sendMessage(chatId, {
                text: '❌ Only the bot owner can use this command.',
                
            });
            return;
        }

        // Get all chats
        const chats = await sock.groupFetchAllParticipating();
        
        if (!chats || Object.keys(chats).length === 0) {
            await sock.sendMessage(chatId, {
                text: '📋 *Group List*\n\nBot is not currently in any groups.',
                
            });
            return;
        }

        // Format the group list
        let groupList = '📋 *Group List*\n\n';
        let count = 1;

        for (const [id, group] of Object.entries(chats)) {
            const groupName = group.subject || 'Unknown Group';
            const memberCount = group.participants?.length || 0;
            
            groupList += `*${count}.* ${groupName}\n`;
            groupList += `   • ID: ${id}\n`;
            groupList += `   • Members: ${memberCount}\n\n`;
            
            count++;
        }

        groupList += `\n*Total Groups:* ${Object.keys(chats).length}`;

        // Send the list to the user
        await sock.sendMessage(chatId, {
            text: groupList,
            
        });

    } catch (error) {
        console.error('Error in group list command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ An error occurred while fetching the group list.',
            
        });
    }
}

module.exports = groupListCommand;