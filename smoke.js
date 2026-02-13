console.log("=== TEE SMOKE TEST ===");
console.log("Node Version:", process.version);
console.log("Environment:", process.env.NODE_ENV);

setInterval(() => {
    console.log("Heartbeat:", new Date().toISOString());
}, 10000);
