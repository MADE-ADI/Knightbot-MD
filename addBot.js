const fs = require('fs');
const path = require('path');

const botName = process.argv[2];
if (!botName) {
    console.error('Please provide a bot name');
    process.exit(1);
}

const ecosystemPath = path.join(__dirname, 'ecosystem.config.js');
let config = require(ecosystemPath);

// Add new bot configuration
config.apps.push({
    name: botName,
    script: "botRunner.js",
    args: botName,
    watch: false,
    ignore_watch: ["node_modules", "bot-sessions"],
    env: {
        NODE_ENV: "production"
    }
});

// Save updated configuration
fs.writeFileSync(
    ecosystemPath,
    `module.exports = ${JSON.stringify(config, null, 2)}`
);

console.log(`Bot ${botName} configuration added. Use 'npm run start-all' to start all bots`);