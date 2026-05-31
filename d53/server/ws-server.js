const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const OUTPUT_DIR = path.join(__dirname, '../output');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket server running on ws://localhost:${PORT}`);

let fileIndex = 0;
let currentFile = null;
let totalBytes = 0;
let frameCount = 0;

wss.on('connection', (ws) => {
    console.log('Client connected');
    
    const filePath = path.join(OUTPUT_DIR, `encoded_${Date.now()}.h265`);
    currentFile = fs.createWriteStream(filePath);
    console.log(`Saving output to: ${filePath}`);

    ws.on('message', (data) => {
        try {
            if (Buffer.isBuffer(data) && data.length > 8) {
                const header = data.slice(0, 8);
                const bitstream = data.slice(8);
                
                const length = header.readUInt32LE(0);
                const timestamp = header.readUInt32LE(4);
                
                if (currentFile) {
                    currentFile.write(bitstream);
                }
                
                totalBytes += bitstream.length;
                frameCount++;
                
                console.log(`Received frame ${frameCount}: ${bitstream.length} bytes, timestamp: ${timestamp}`);
            } else {
                const message = JSON.parse(data.toString());
                if (message.type === 'stats') {
                    console.log('Encoder stats:', message);
                }
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        console.log(`Total received: ${totalBytes} bytes in ${frameCount} frames`);
        
        if (currentFile) {
            currentFile.end();
            currentFile = null;
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});

process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    if (currentFile) {
        currentFile.end();
    }
    wss.close();
    process.exit(0);
});
