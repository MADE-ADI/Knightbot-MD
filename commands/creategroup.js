const fs = require('fs');
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

async function createGroupCommand(sock, chatId, senderId, message) {
    try {
        // Check if sender is owner
        if (!isOwner(senderId)) {
            await sock.sendMessage(chatId, { 
                text: '❌ Only the bot owner can use this command.',
                
            });
            return;
        }

        // Extract command parts: .creategroup <group_name> [@user1 @user2 ... or phone numbers]
        const fullCommand = message.message?.extendedTextMessage?.text || 
                           message.message?.conversation || '';
        
        // Get everything after the command
        const commandParts = fullCommand.trim().split(' ');
        commandParts.shift(); // Remove the command itself (.creategroup)
        
        if (commandParts.length < 1) {
            await sock.sendMessage(chatId, { 
                text: '❌ Please provide a group name!\n\nUsage:\n.creategroup <group_name> [@user1 @user2... or number1 number2...]\n\nNote: Adding participants is optional.',
                
            });
            return;
        }

        // First part is the group name
        const groupName = commandParts[0];
        
        // Get participants from mentions or provided numbers
        let participants = [];
        
        // First check for mentions
        const mentionedJids = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentionedJids.length > 0) {
            participants = mentionedJids;
        } else if (commandParts.length > 1) {
            // If no mentions but arguments provided, try to parse phone numbers
            for (let i = 1; i < commandParts.length; i++) {
                let phoneNumber = commandParts[i].replace(/[^0-9]/g, ''); // Remove non-numeric characters
                
                if (phoneNumber.length >= 10) {
                    // Convert to standard format @s.whatsapp.net
                    if (!phoneNumber.startsWith('1') && !phoneNumber.startsWith('62') && 
                        !phoneNumber.startsWith('44') && !phoneNumber.startsWith('91')) {
                        phoneNumber = "91" + phoneNumber; // Add default country code
                    }
                    participants.push(`${phoneNumber}@s.whatsapp.net`);
                }
            }
        }

        // Always add the sender (bot owner) to the participants if empty
        if (participants.length === 0) {
            participants = [senderId];
        }

        // Send processing message
        await sock.sendMessage(chatId, { 
            text: '⏳ Creating group...',
            
        });

        // Create the group
        const group = await sock.groupCreate(groupName, participants);
        
        if (group && group.id) {
            // Generate group invite link
            try {
                const inviteCode = await sock.groupInviteCode(group.id);
                const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                
                // Send success message with group link
                const participantText = participants.length === 1 && participants[0] === senderId ? 
                    '*Empty group created*' : 
                    `*Participants:* ${participants.length}`;
                
                await sock.sendMessage(chatId, { 
                    text: `✅ Group created successfully!\n\n*Group Name:* ${groupName}\n${participantText}\n\n*Invite Link:* ${inviteLink}`,
                    
                });
                
                // Send a welcome message to the new group
                await sock.sendMessage(group.id, {
                    text: `🎉 Welcome to *${groupName}*!\n\nThis group was created by the bot owner.\n\nUse the group invite link to add more members.`,
                    
                });
            } catch (error) {
                console.error('Error getting invite link:', error);
                await sock.sendMessage(chatId, { 
                    text: `✅ Group created successfully, but couldn't generate invite link.\n\n*Group Name:* ${groupName}`,
                    
                });
            }
        } else {
            throw new Error('Failed to create group, invalid response');
        }

    } catch (error) {
        console.error('Error creating group:', error);
        await sock.sendMessage(chatId, { 
            text: `❌ Failed to create group: ${error.message}`,
            
        });
    }
}

module.exports = createGroupCommand;