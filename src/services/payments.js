const { ethers } = require('ethers');
const crypto = require('crypto');

class PaymentService {
    constructor() {
        const rpc = process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';
        this.provider = new ethers.JsonRpcProvider(rpc);
        this.paymentWallet = process.env.PAYMENT_WALLET || process.env.WALLET_ADDRESS;
        this.minPaymentEth = process.env.MIN_PAYMENT_ETH || '0.001';
        console.log('[Payments] Wallet:', this.paymentWallet, '| Min:', this.minPaymentEth, 'ETH');
        this.nonces = new Map();   // address -> { nonce, expires }
        this.sessions = new Map(); // token -> { address, verified, paid, expires }
        this.telegramPaid = new Map(); // chatId -> { paid, txHash, expires }

        // Beta invite code system
        this.betaCode = process.env.BETA_INVITE_CODE || 'ALFRED-v1';
        this.betaMaxUses = parseInt(process.env.BETA_MAX_USES, 10) || 15;
        this.betaUsers = new Map(); // chatId -> { redeemedAt }
        this.betaUsedCount = 0;
        console.log('[Payments] Beta code active | Max uses:', this.betaMaxUses);
    }

    // Step 1: Generate a nonce for wallet to sign
    getNonce(address) {
        const addr = address.toLowerCase();
        const nonce = crypto.randomBytes(16).toString('hex');
        this.nonces.set(addr, {
            nonce,
            expires: Date.now() + 5 * 60 * 1000 // 5 min
        });
        return {
            nonce,
            message: `Sign in to Alfred Curator\nNonce: ${nonce}`
        };
    }

    // Step 2: Verify signature and create session
    verifySignature(address, signature) {
        const addr = address.toLowerCase();
        const entry = this.nonces.get(addr);
        if (!entry) throw new Error('No nonce found — call /auth/nonce first');
        if (Date.now() > entry.expires) {
            this.nonces.delete(addr);
            throw new Error('Nonce expired');
        }

        const message = `Sign in to Alfred Curator\nNonce: ${entry.nonce}`;
        const recovered = ethers.verifyMessage(message, signature).toLowerCase();
        if (recovered !== addr) {
            throw new Error('Signature does not match address');
        }

        this.nonces.delete(addr);

        // Create session token
        const token = crypto.randomBytes(32).toString('hex');
        this.sessions.set(token, {
            address: addr,
            verified: true,
            paid: false,
            expires: Date.now() + 24 * 60 * 60 * 1000 // 24h
        });

        return { token, address: addr };
    }

    // Step 3: Check payment status (no txHash = return payment instructions)
    // sessionToken can be null for A2A direct tx verification
    async checkPayment(sessionToken, txHash) {
        const session = sessionToken ? this.sessions.get(sessionToken) : null;
        if (sessionToken && !session) throw new Error('Invalid session');
        if (session?.paid) return { paid: true, txHash: session.txHash, address: session.address };

        if (!this.paymentWallet) throw new Error('No PAYMENT_WALLET configured');

        // If no txHash provided, return payment instructions
        if (!txHash) {
            return {
                paid: false,
                address: session?.address,
                payTo: this.paymentWallet,
                amount: `${this.minPaymentEth} Sepolia ETH`,
                network: 'Sepolia (chainId 11155111)'
            };
        }

        // Verify the specific transaction
        const minWei = ethers.parseEther(this.minPaymentEth);
        const receipt = await this.provider.getTransactionReceipt(txHash);
        if (!receipt) {
            return { paid: false, error: 'Transaction not confirmed yet — waiting for block', txHash };
        }
        if (receipt.status === 0) {
            return { paid: false, error: 'Transaction reverted on-chain. Please send a new payment.', txHash };
        }

        const tx = await this.provider.getTransaction(txHash);
        if (!tx) {
            return { paid: false, error: 'Transaction not found', txHash };
        }

        // For session-based: verify sender matches session wallet
        // For A2A (no session): just verify recipient and amount
        const toMatch = tx.to?.toLowerCase() === this.paymentWallet.toLowerCase();
        const valueOk = tx.value >= minWei;

        if (session && tx.from.toLowerCase() !== session.address) {
            return { paid: false, error: 'Transaction sender does not match session wallet' };
        }
        if (!toMatch) return { paid: false, error: 'Transaction recipient does not match payment wallet' };
        if (!valueOk) return { paid: false, error: `Insufficient amount. Sent: ${ethers.formatEther(tx.value)} ETH, required: ${this.minPaymentEth} ETH` };

        if (session) {
            session.paid = true;
            session.txHash = txHash;
        }
        return { paid: true, txHash, address: session.address };
    }

    // Redeem a beta invite code for a Telegram chat
    redeemBetaCode(chatId, code) {
        const id = String(chatId);
        if (this.betaUsers.has(id)) {
            return { success: true, alreadyRedeemed: true };
        }
        if (code !== this.betaCode) {
            return { success: false, error: 'Invalid code' };
        }
        if (this.betaUsedCount >= this.betaMaxUses) {
            return { success: false, error: 'Beta is full' };
        }
        this.betaUsers.set(id, { redeemedAt: Date.now() });
        this.betaUsedCount++;
        console.log(`[Payments] Beta code redeemed by chatId ${id} (${this.betaUsedCount}/${this.betaMaxUses})`);
        return { success: true };
    }

    // Telegram payment check (by chat ID)
    isTelegramPaid(chatId) {
        const id = String(chatId);
        // Beta users always have access
        if (this.betaUsers.has(id)) {
            return { paid: true, beta: true };
        }
        const entry = this.telegramPaid.get(id);
        if (!entry) return { paid: false, payTo: this.paymentWallet, amount: this.minPaymentEth, network: 'Sepolia' };
        if (Date.now() > entry.expires) {
            this.telegramPaid.delete(id);
            return { paid: false, payTo: this.paymentWallet, amount: this.minPaymentEth, network: 'Sepolia' };
        }
        return { paid: true, txHash: entry.txHash };
    }

    // Verify Telegram user payment by txHash
    async verifyTelegramPayment(chatId, txHash) {
        if (!this.paymentWallet) throw new Error('No PAYMENT_WALLET configured');
        if (!txHash) return { paid: false, error: 'txHash required' };

        const minWei = ethers.parseEther(this.minPaymentEth);
        const receipt = await this.provider.getTransactionReceipt(txHash);
        if (!receipt) return { paid: false, error: 'Transaction not confirmed yet' };
        if (receipt.status === 0) return { paid: false, error: 'Transaction reverted on-chain' };

        const tx = await this.provider.getTransaction(txHash);
        if (!tx) return { paid: false, error: 'Transaction not found' };

        const toMatch = tx.to?.toLowerCase() === this.paymentWallet.toLowerCase();
        const valueOk = tx.value >= minWei;
        if (!toMatch) return { paid: false, error: 'Recipient does not match payment wallet' };
        if (!valueOk) return { paid: false, error: `Insufficient amount. Sent: ${ethers.formatEther(tx.value)} ETH, required: ${this.minPaymentEth} ETH` };

        this.telegramPaid.set(String(chatId), {
            paid: true,
            txHash,
            expires: Date.now() + 24 * 60 * 60 * 1000 // 24h access
        });
        return { paid: true, txHash };
    }

    // Get session info
    getSession(token) {
        const session = this.sessions.get(token);
        if (!session) return null;
        if (Date.now() > session.expires) {
            this.sessions.delete(token);
            return null;
        }
        return session;
    }

    // Cleanup expired sessions/nonces
    cleanup() {
        const now = Date.now();
        for (const [k, v] of this.nonces) {
            if (now > v.expires) this.nonces.delete(k);
        }
        for (const [k, v] of this.sessions) {
            if (now > v.expires) this.sessions.delete(k);
        }
    }
}

module.exports = PaymentService;
