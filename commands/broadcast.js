const fs = require('fs');
const path = require('path');
const isOwner = require('../helpers/isOwner');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

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
 * Command to broadcast messages to all groups
 * @param {Object} sock - Socket connection
 * @param {String} chatId - Chat ID
 * @param {String} senderId - Sender ID
 * @param {Object} message - Message object
 */
async function broadcastCommand(sock, chatId, senderId, message) {
    try {
        // Check if sender is owner
        if (!isOwner(senderId)) {
            await sock.sendMessage(chatId, { 
                text: '❌ Only the bot owner can use this command.',
                
            });
            return;
        }

        // Extract broadcast message content
        let broadcastText = message.message?.conversation || 
                           message.message?.extendedTextMessage?.text || '';
        
        // Remove command prefix (.broadcast or .bc)
        if (broadcastText.startsWith('.broadcast')) {
            broadcastText = broadcastText.substring(10).trim();
        } else if (broadcastText.startsWith('.bc')) {
            broadcastText = broadcastText.substring(3).trim();
        }

        // Check if there's actual content to broadcast
        if (!broadcastText && !message.message?.imageMessage && 
            !message.message?.videoMessage && !message.message?.documentMessage &&
            !message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            await sock.sendMessage(chatId, { 
                text: '❌ Please provide content to broadcast!\n\nUsage:\n*.broadcast* _your message here_\n\nYou can also reply to an image/video/document with the command.',
                
            });
            return;
        }

        // Get the list of all groups the bot is in
        await sock.sendMessage(chatId, { 
            text: '🔍 Getting group list...',
            
        });

        const groupsObj = await sock.groupFetchAllParticipating();
        const groups = Object.keys(groupsObj);
        
        if (groups.length === 0) {
            await sock.sendMessage(chatId, { 
                text: '❌ Bot is not in any groups.',
                
            });
            return;
        }

        await sock.sendMessage(chatId, { 
            text: `📢 Broadcasting to ${groups.length} groups...\nThis may take some time.`,
            
        });

        // Variables to track progress
        let successCount = 0;
        let failCount = 0;
        let startTime = Date.now();
        
        // Arrays to store successful and failed group names
        let successGroups = [];
        let failedGroups = [];

        // Check if message has media content directly
        let mediaType = null;
        let mediaContent = null;
        let caption = broadcastText;
        let filename, mimetype;
        
        // Handle direct media in the message
        if (message.message?.imageMessage) {
            mediaType = 'image';
            mediaContent = await downloadMedia(message, 'image');
        } else if (message.message?.videoMessage) {
            mediaType = 'video';
            mediaContent = await downloadMedia(message, 'video');
        } else if (message.message?.documentMessage) {
            mediaType = 'document';
            mediaContent = await downloadMedia(message, 'document');
            filename = message.message.documentMessage.fileName || 'document';
            mimetype = message.message.documentMessage.mimetype;
        } 
        // Check if quoted message contains media
        else if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedMsg = message.message.extendedTextMessage.contextInfo.quotedMessage;
            
            if (quotedMsg.imageMessage) {
                mediaType = 'image';
                mediaContent = await downloadMedia(
                    { message: { imageMessage: quotedMsg.imageMessage } }, 
                    'image'
                );
            } else if (quotedMsg.videoMessage) {
                mediaType = 'video';
                mediaContent = await downloadMedia(
                    { message: { videoMessage: quotedMsg.videoMessage } }, 
                    'video'
                );
            } else if (quotedMsg.documentMessage) {
                mediaType = 'document';
                mediaContent = await downloadMedia(
                    { message: { documentMessage: quotedMsg.documentMessage } }, 
                    'document'
                );
                filename = quotedMsg.documentMessage.fileName || 'document';
                mimetype = quotedMsg.documentMessage.mimetype;
            } else if (quotedMsg.conversation || quotedMsg.extendedTextMessage) {
                // If quoted message is just text, add it to the broadcast text
                const quotedText = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '';
                if (quotedText && !broadcastText.includes(quotedText)) {
                    caption = `${broadcastText}\n\n_Quoted message:_\n${quotedText}`;
                }
            }
        }

        // Process each group
        for (const groupId of groups) {
            try {
                // Get group name
                const groupName = groupsObj[groupId].subject || groupId.split('@')[0];
                
                // Create message content based on media type
                let broadcastMsg = {};
                
                if (mediaType === 'image') {
                    broadcastMsg = {
                        image: mediaContent,
                        caption: caption,
                        
                    };
                } else if (mediaType === 'video') {
                    broadcastMsg = {
                        video: mediaContent,
                        caption: caption,
                        
                    };
                } else if (mediaType === 'document') {
                    broadcastMsg = {
                        document: mediaContent,
                        mimetype: mimetype,
                        fileName: filename,
                        caption: caption,
                        
                    };
                } else {
                    // Text-only message
                    broadcastMsg = {
                        text: caption || '📢 *Broadcast Message*',
                        
                    };
                }
                
                // Send the message to the group
                await sock.sendMessage(groupId, broadcastMsg);
                successCount++;
                successGroups.push(groupName);
                
                // Add delay between messages to avoid flood detection
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Error broadcasting to ${groupId}:`, error);
                failCount++;
                
                // Store failed group name or ID if name can't be retrieved
                try {
                    const groupName = groupsObj[groupId].subject || groupId.split('@')[0];
                    failedGroups.push(groupName);
                } catch (e) {
                    failedGroups.push(groupId.split('@')[0]);
                }
            }
            
            // Update progress every 5 groups or at the end
            if ((successCount + failCount) % 5 === 0 || (successCount + failCount) === groups.length) {
                await sock.sendMessage(chatId, {
                    text: `📊 *Broadcast Progress*\n\n✅ Sent: ${successCount}/${groups.length}\n❌ Failed: ${failCount}`,
                    
                });
            }
        }
        
        // Calculate time taken
        const timeTaken = ((Date.now() - startTime) / 1000).toFixed(1);
        
        // Format the group lists
        const successGroupsList = successGroups.length > 0 
            ? successGroups.map((name, i) => `${i+1}. ${name}`).join('\n')
            : "None";
            
        const failedGroupsList = failedGroups.length > 0 
            ? failedGroups.map((name, i) => `${i+1}. ${name}`).join('\n')
            : "None";
        
        // Send summary message (basic info)
        await sock.sendMessage(chatId, {
            text: `📢 *Broadcast Completed*\n\n✅ Successfully sent to: ${successCount} groups\n❌ Failed: ${failCount} groups\n⏱️ Time taken: ${timeTaken}s`,
            
        });
        
        // Send detailed reports if there are any groups
        if (successGroups.length > 0) {
            // Split success list if too long
            const maxGroupsPerMessage = 30; // Avoid message too long errors
            const chunksSuccess = [];
            
            for (let i = 0; i < successGroups.length; i += maxGroupsPerMessage) {
                chunksSuccess.push(successGroups.slice(i, i + maxGroupsPerMessage));
            }
            
            // Send success lists
            for (let i = 0; i < chunksSuccess.length; i++) {
                const partNumber = chunksSuccess.length > 1 ? ` (Part ${i+1}/${chunksSuccess.length})` : '';
                const listText = chunksSuccess[i].map((name, j) => `${i * maxGroupsPerMessage + j + 1}. ${name}`).join('\n');
                
                await sock.sendMessage(chatId, {
                    text: `✅ *Successfully Sent To*${partNumber}:\n\n${listText}`,
                    
                });
                
                // Add delay between messages
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // Send failed list if any
        if (failedGroups.length > 0) {
            await sock.sendMessage(chatId, {
                text: `❌ *Failed To Send To*:\n\n${failedGroupsList}`,
                
            });
        }

    } catch (error) {
        console.error('Error in broadcast command:', error);
        await sock.sendMessage(chatId, { 
            text: `❌ Error during broadcast: ${error.message}`,
            
        });
    }
}

/**
 * Helper function to download media content
 */
async function downloadMedia(message, type) {
    try {
        let mediaMessage;
        
        switch(type) {
            case 'image':
                mediaMessage = message.message.imageMessage;
                break;
            case 'video':
                mediaMessage = message.message.videoMessage;
                break;
            case 'document':
                mediaMessage = message.message.documentMessage;
                break;
            default:
                throw new Error('Unknown media type');
        }
        
        // Download the media content
        const stream = await downloadContentFromMessage(mediaMessage, type);
        let buffer = Buffer.from([]);
        
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        return buffer;
    } catch (error) {
        console.error('Error downloading media:', error);
        throw error;
    }
}

module.exports = broadcastCommand;