const { createPublicClient, createWalletClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { sepolia } = require('viem/chains');
require('dotenv').config();

// The Authority account we want to fix
const PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
const account = privateKeyToAccount(PRIVATE_KEY);

const rpcUrl = 'https://ethereum-sepolia-rpc.publicnode.com';

const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl)
});

const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl)
});

async function fixDelegation() {
    console.log(`Checking delegation status for ${account.address}...`);

    // EIP-7702 Undelegate: Sign an authorization to 0x0 address
    const chainId = await publicClient.getChainId();
    const nonce = await publicClient.getTransactionCount({ address: account.address });

    console.log(`Current Nonce: ${nonce}`);
    console.log(`Signing EIP-7702 Authorization to 0x0...`);

    // We use signAuthorization which is the core of EIP-7702
    const authorization = await walletClient.signAuthorization({
        contractAddress: '0x0000000000000000000000000000000000000000',
        chainId: Number(chainId),
        nonce: nonce
    });

    console.log(`Sending transaction with authorization...`);

    try {
        const hash = await walletClient.sendTransaction({
            to: account.address,
            authorizationList: [authorization],
            gas: 100000n, // Fixed high gas to avoid "intrinsic gas too low"
        });

        console.log(`✅ Transaction sent! Hash: ${hash}`);
        console.log(`Verify here: https://sepolia.etherscan.io/tx/${hash}`);
    } catch (err) {
        console.error(`❌ Failed to send transaction: ${err.message}`);

        if (err.message.includes('authorizationList')) {
            console.log('Your viem version might be too old or your RPC does not support EIP-7702 yet.');
            console.log('Trying fallback: normal transaction to clear potential stuck nonces.');

            const hash = await walletClient.sendTransaction({
                to: account.address,
                value: 0n,
                gas: 30000n
            });
            console.log(`✅ Normal transaction sent: ${hash}`);
        }
    }
}

fixDelegation().catch(console.error);
