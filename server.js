const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(cors());
app.use(express.static('public'));
app.use('/output', express.static('output'));

// Use a simple API to get list of completed articles
app.get('/api/articles', (req, res) => {
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) return res.json([]);

    const articles = fs.readdirSync(outputDir)
        .filter(file => fs.statSync(path.join(outputDir, file)).isDirectory())
        .map(folder => {
            const folderPath = path.join(outputDir, folder);
            const title = folder.split('_').slice(1).join(' ').replace(/-/g, ' ');
            const date = folder.split('_')[0];
            return {
                folder,
                title,
                date,
                hasFinal: fs.existsSync(path.join(folderPath, '3-final-article.md'))
            };
        })
        .reverse(); // Newest first
    res.json(articles);
});

// Real-time Pipeline Runner
io.on('connection', (socket) => {
    console.log('Client connected');

    socket.on('run-pipeline', (topic) => {
        console.log(`Running pipeline for: ${topic}`);

        const pipeline = spawn('node', ['src/pipeline.js', topic], {
            cwd: __dirname,
            env: { ...process.env, FORCE_COLOR: '1' } // maintain color output
        });

        // Stream stdout
        pipeline.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) socket.emit('log', line);
            });
        });

        // Stream stderr
        pipeline.stderr.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) socket.emit('log', `ERROR: ${line}`);
            });
        });

        pipeline.on('close', (code) => {
            socket.emit('log', `✅ Pipeline finished with code ${code}`);
            socket.emit('done');
        });
    });
});

const PORT = 3000;
httpServer.listen(PORT, () => {
    console.log(`
🚀 Control Center running at: http://localhost:${PORT}
    `);
});
