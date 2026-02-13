
const fs = require('fs');
const os = require('os');

console.log('--- STARTING DEBUG ENTRYPOINT ---');
console.log('Timestamp:', new Date().toISOString());
console.log('Node Version:', process.version);
console.log('Platform:', os.platform(), os.release());
console.log('User:', os.userInfo().username);
console.log('Current Directory:', process.cwd());

console.log('--- ENVIRONMENT VARIABLES ---');
// Print env vars safely (redact keys partially if needed, but for now we need to see IF they exist)
Object.keys(process.env).forEach(key => {
    if (key.includes('KEY') || key.includes('SECRET') || key.includes('TOKEN')) {
        console.log(`${key}: [REDACTED_LENGTH_${process.env[key].length}]`);
    } else {
        console.log(`${key}: ${process.env[key]}`);
    }
});

console.log('--- FILESYSTEM CHECK ---');
try {
    const files = fs.readdirSync('.');
    console.log('Files in root:', files.join(', '));
} catch (e) {
    console.error('Error listing files:', e.message);
}

console.log('--- NETWORK CHECK ---');
// Simple DNS resolution check could go here, but let's keep it simple.

console.log('--- SLEEPING FOREVER ---');
// Keep the process alive so we can fetch logs
setInterval(() => {
    console.log('Still alive...', new Date().toISOString());
}, 10000);
