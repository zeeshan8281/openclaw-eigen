import { WebSocket } from 'ws';

const ws = new WebSocket('ws://34.148.153.169:3000');
const token = 'eigen123';

ws.on('open', () => {
    console.log('Connected to OpenClaw TEE');
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('Received type:', msg.type || msg.event);

    if (msg.event === 'connect.challenge') {
        const nonce = msg.payload.nonce;
        console.log(`Responding to challenge with nonce: ${nonce}`);
        ws.send(JSON.stringify({
            type: 'req',
            id: 'c1',
            method: 'connect',
            params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                    id: 'test',
                    version: '1.0.0',
                    platform: 'node',
                    mode: 'test'
                },
                role: 'operator',
                auth: { token },
                device: {
                    id: 'test-device',
                    publicKey: 'test-key',
                    signature: 'test-sig',
                    signedAt: Date.now(),
                    nonce: nonce
                }
            }
        }));
    } else if (msg.id === 'c1') {
        if (msg.ok) {
            console.log('Connection established! Requesting cron list...');
            ws.send(JSON.stringify({
                type: 'req',
                id: 'cron-list',
                method: 'cron.list',
                params: {}
            }));
        } else {
            console.error('Connect failed:', JSON.stringify(msg.error, null, 2));
            process.exit(1);
        }
    } else if (msg.id === 'cron-list') {
        console.log('Cron List:', JSON.stringify(msg.payload || msg.result, null, 2));
        process.exit(0);
    }
});

ws.on('error', (err) => {
    console.error('WS Error:', err.message);
    process.exit(1);
});

ws.on('close', (code, reason) => {
    console.log(`Connection closed: ${code} ${reason}`);
    process.exit(1);
});
