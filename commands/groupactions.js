const fs = require('fs');
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

/**
 * Command to join a WhatsApp group via invite link
 * @param {Object} sock - Socket connection
 * @param {String} chatId - Chat ID
 * @param {String} senderId - Sender ID
 * @param {String} text - Message text containing the invite link
 */
async function joinGroupCommand(sock, chatId, senderId, text) {
    try {
        // Check if sender is owner
        if (!isOwner(senderId)) {
            await sock.sendMessage(chatId, { 
                text: '❌ Only the bot owner can use this command.',
                
            });
            return;
        }

        // Extract the invite link from the original text (not lowercase)
        // Get the original message text from message object if available
        const originalMessage = text || '';
        
        // Find the URL in the message
        let inviteLink = '';
        
        // Try to find chat.whatsapp.com link in the message
        const linkRegex = /(https?:\/\/)?chat\.whatsapp\.com\/([a-zA-Z0-9]{10,})/i;
        const match = originalMessage.match(linkRegex);
        
        if (match) {
            // Use the exact case as it appears in the message
            inviteLink = match[0];
        }
        
        // If no invite link found
        if (!inviteLink) {
            await sock.sendMessage(chatId, { 
                text: '❌ Please provide a valid WhatsApp group invite link!\n\nUsage: .join https://chat.whatsapp.com/xxxx',
                
            });
            return;
        }
        
        // Extract just the code from the link
        let inviteCode = '';
        
        if (inviteLink.includes('chat.whatsapp.com/')) {
            // Extract the code preserving case
            inviteCode = inviteLink.split('chat.whatsapp.com/')[1];
            
            // Clean up the code (remove anything that's not valid in the code)
            inviteCode = inviteCode.split(/[^a-zA-Z0-9]/)[0];
        }
        
        if (!inviteCode) {
            await sock.sendMessage(chatId, { 
                text: '❌ Could not extract invite code from link.',
                
            });
            return;
        }

        // Send processing message
        await sock.sendMessage(chatId, { 
            text: '⏳ Joining group...',
            
        });

        // Accept the invite
        const joinResult = await sock.groupAcceptInvite(inviteCode);
        
        if (joinResult) {
            await sock.sendMessage(chatId, { 
                text: '✅ Successfully joined the group!',
                
            });
        } else {
            throw new Error('Failed to join the group. The invite might be invalid or expired.');
        }

    } catch (error) {
        console.error('Error joining group:', error);
        
        let errorMessage = error.message;
        if (error.message.includes('not-authorized')) {
            errorMessage = 'The invite link is invalid, expired, or the group is full.';
        } else if (error.message.includes('already-participant')) {
            errorMessage = 'Bot is already a participant in this group.';
        }
        
        await sock.sendMessage(chatId, { 
            text: `❌ Failed to join group: ${errorMessage}`,
            
        });
    }
}

/**
 * Command to leave a WhatsApp group
 * @param {Object} sock - Socket connection
 * @param {String} chatId - Chat ID
 * @param {String} senderId - Sender ID
 */
async function leaveGroupCommand(sock, chatId, senderId) {
    try {
        // Check if sender is owner
        if (!isOwner(senderId)) {
            await sock.sendMessage(chatId, { 
                text: '❌ Only the bot owner can use this command.',
                
            });
            return;
        }

        // Check if this is a group chat
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { 
                text: '❌ This command can only be used in groups.',
                
            });
            return;
        }

        // Send goodbye message
        await sock.sendMessage(chatId, { 
            text: '👋 Goodbye! Leaving this group as requested by the owner.',
            
        });

        // Wait a moment for the message to be delivered
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Leave the group
        await sock.groupLeave(chatId);
        
        // Send confirmation to bot owner's private chat
        await sock.sendMessage(senderId, { 
            text: `✅ Successfully left the group!`,
            
        });

    } catch (error) {
        console.error('Error leaving group:', error);
        
        // Send error to the owner privately
        await sock.sendMessage(senderId, { 
            text: `❌ Failed to leave group: ${error.message}`,
            
        });
    }
}

module.exports = {
    joinGroupCommand,
    leaveGroupCommand
};