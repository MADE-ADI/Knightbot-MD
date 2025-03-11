const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Store bot processes
const botProcesses = new Map();

// Serve static files
router.use(express.static(path.join(__dirname, 'public')));

// Root route to serve QR scanner page
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API routes
router.get('/api/bots', (req, res) => {
    const sessions = [];
    const sessionsDir = path.join(__dirname, '../bot-sessions');
    
    if (fs.existsSync(sessionsDir)) {
        fs.readdirSync(sessionsDir).forEach(dir => {
            const configPath = path.join(sessionsDir, dir, 'config/owner.json');
            let owner = [];
            if (fs.existsSync(configPath)) {
                owner = JSON.parse(fs.readFileSync(configPath));
            }
            
            sessions.push({
                id: dir,
                isRunning: botProcesses.has(dir),
                owner: owner
            });
        });
    }
    
    res.json(sessions);
});

// Start new bot instance
router.post('/api/bots', (req, res) => {
    const { botId, owner } = req.body;
    
    if (!botId) {
        return res.status(400).json({ error: 'Bot ID required' });
    }
    
    // Create bot directory and config
    const botDir = path.join(__dirname, '../bot-sessions', botId);
    const configDir = path.join(botDir, 'config');
    
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
        path.join(configDir, 'owner.json'),
        JSON.stringify(owner || [], null, 2)
    );
    
    // Start bot process
    const process = spawn('node', ['index.js'], {
        env: { ...process.env, BOT_ID: botId },
        cwd: path.join(__dirname, '..')
    });
    
    botProcesses.set(botId, process);
    
    process.stdout.on('data', (data) => {
        console.log(`[Bot ${botId}]:`, data.toString());
    });
    
    process.stderr.on('data', (data) => {
        console.error(`[Bot ${botId} Error]:`, data.toString());
    });
    
    res.json({ message: `Bot ${botId} started successfully` });
});

// Stop bot instance
router.delete('/api/bots/:id', (req, res) => {
    const { id } = req.params;
    const process = botProcesses.get(id);
    
    if (process) {
        process.kill();
        botProcesses.delete(id);
        res.json({ message: `Bot ${id} stopped successfully` });
    } else {
        res.status(404).json({ error: 'Bot not found' });
    }
});

// Update bot owner
router.put('/api/bots/:id/owner', (req, res) => {
    const { id } = req.params;
    const { owner } = req.body;
    
    const configPath = path.join(__dirname, '../bot-sessions', id, 'config/owner.json');
    
    if (fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify(owner, null, 2));
        res.json({ message: 'Owner updated successfully' });
    } else {
        res.status(404).json({ error: 'Bot not found' });
    }
});

module.exports = router;