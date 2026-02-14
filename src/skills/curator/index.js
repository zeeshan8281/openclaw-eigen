/**
 * OpenClaw Skill Wrapper for the Curator Agent
 *
 * This is an isolated file that bridges the OpenClaw A2A gateway
 * to the underlying curator + news cycle. It exposes the curator's
 * data through OpenClaw's tool invocation protocol.
 *
 * When loaded by OpenClaw gateway, it registers tools that other
 * agents can call via /tools/invoke.
 */

const path = require('path');

// Lazy-load the curator to avoid double-initialization
// when running alongside autonomous.js
let _curator = null;
function getCurator() {
    if (!_curator) {
        const Curator = require('../../curator');
        _curator = new Curator();
    }
    return _curator;
}

let _runNewsCycle = null;
function getNewsCycle() {
    if (!_runNewsCycle) {
        _runNewsCycle = require('../../news-cycle').runNewsCycle;
    }
    return _runNewsCycle;
}

/**
 * OpenClaw Skill Entry Point
 *
 * Called by the OpenClaw gateway when the skill is loaded.
 * Registers available actions that can be invoked via A2A.
 */
module.exports = {
    name: 'curator',
    version: '2.0.0',
    description: 'Information Curator Agent — curates crypto/tech news signals from RSS feeds and HackerNews.',

    /**
     * Handle tool invocations from the OpenClaw gateway
     *
     * @param {string} action - The action to perform
     * @param {object} args - Arguments for the action
     * @param {object} context - OpenClaw context (logging, state, etc.)
     * @returns {object} Result of the action
     */
    async invoke(action, args = {}, context = {}) {
        const log = context.log || console;
        const curator = getCurator();

        switch (action) {
            case 'signals': {
                const limit = args.limit || 20;
                const signals = curator.memory.highSignals.slice(-limit).reverse();
                return { count: signals.length, signals };
            }

            case 'briefing': {
                const runNewsCycle = getNewsCycle();
                const result = await runNewsCycle({ storeOnDA: false });
                return {
                    briefing: result.briefing,
                    articleCount: result.articleCount,
                    proof: result.proof || null
                };
            }

            case 'curate': {
                log.info?.('[Curator Skill] Running curation cycle...');
                await curator.runCycle();
                return { ok: true, stats: curator.getDetails() };
            }

            case 'stats': {
                return {
                    feeds: 6,
                    seenItems: curator.memory.seenHashes.length,
                    highSignals: curator.memory.highSignals.length
                };
            }

            default:
                return { error: `Unknown action: ${action}. Available: signals, briefing, curate, stats` };
        }
    },

    /**
     * Register method — called by OpenClaw if it uses the register pattern.
     * Sets up cron and commands.
     */
    register(context) {
        if (context.cron) {
            context.cron.schedule('0 */4 * * *', () => {
                getCurator().runCycle().catch(err => {
                    console.error('[Curator Skill] Cron cycle failed:', err.message);
                });
            });
        }

        if (context.commands) {
            context.commands.register('curate', async () => {
                await getCurator().runCycle();
                return getCurator().getDetails();
            });

            context.commands.register('signals', () => {
                const curator = getCurator();
                return curator.memory.highSignals.slice(-10).reverse();
            });
        }
    }
};
