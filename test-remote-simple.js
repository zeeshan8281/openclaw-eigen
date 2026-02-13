import { WebSocket } from 'ws';

const ws = new WebSocket('ws://34.148.153.169:3000');
const token = 'eigen123';

ws.on('open', () => {
    console.log('Connected to OpenClaw TEE');
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());

    if (msg.event === 'connect.challenge') {
        const nonce = msg.payload.nonce;
        ws.send(JSON.stringify({
            type: 'req',
            id: 'c1',
            method: 'connect',
            params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                    id: 'cli', // Use a real ID from the repo
                    version: '1.0.0',
                    platform: 'node',
                    mode: 'cli'
                },
                auth: { token }
                // Notice: I removed 'device' and 'nonce' at root.
                // OpenClaw allows token auth without device signature if configured.
            }
        }));
    } else if (msg.id === 'c1') {
        if (msg.ok) {
            console.log('Successfully Authenticated!');
            process.exit(0);
        } else {
            console.error('Auth Failed:', JSON.stringify(msg.error, null, 2));
            process.exit(1);
        }
    }
});

ws.on('error', (err) => {
    console.error('WS Error:', err.message);
    process.exit(1);
});

setTimeout(() => {
    console.error('Timeout');
    process.exit(1);
}, 10000);
