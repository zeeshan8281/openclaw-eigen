/**
 * Briefing Generator — No LLM Required
 * 
 * Formats scored articles into a clean Telegram-friendly briefing.
 * No AI summarization — just curated headlines with sources.
 */

/**
 * Generate a briefing from scored articles
 * @param {Array} articles - Scored article objects
 * @returns {string} Formatted briefing text
 */
function generateBriefing(articles) {
    if (!articles || articles.length === 0) {
        return 'No notable news in the last cycle.';
    }

    const now = new Date();
    const timeStr = now.toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'UTC'
    });

    // Categorize articles
    const crypto = [];
    const ai = [];
    const general = [];

    for (const a of articles) {
        const t = (a.title + ' ' + (a.snippet || '')).toLowerCase();
        if (/bitcoin|ethereum|crypto|defi|nft|token|blockchain|solana|eigenlayer|avs|restaking/i.test(t)) {
            crypto.push(a);
        } else if (/\bai\b|artificial intelligence|llm|gpt|model|machine learning|neural/i.test(t)) {
            ai.push(a);
        } else {
            general.push(a);
        }
    }

    const lines = [`NEWS BRIEFING | ${timeStr} UTC\n`];

    if (crypto.length > 0) {
        lines.push('CRYPTO & WEB3');
        for (const a of crypto) {
            lines.push(`• ${a.title}`);
            lines.push(`  ${a.source} — ${a.link}`);
        }
        lines.push('');
    }

    if (ai.length > 0) {
        lines.push('AI & TECH');
        for (const a of ai) {
            lines.push(`• ${a.title}`);
            lines.push(`  ${a.source} — ${a.link}`);
        }
        lines.push('');
    }

    if (general.length > 0) {
        lines.push('GENERAL');
        for (const a of general) {
            lines.push(`• ${a.title}`);
            lines.push(`  ${a.source} — ${a.link}`);
        }
        lines.push('');
    }

    lines.push(`${articles.length} articles curated from ${new Set(articles.map(a => a.source)).size} sources`);

    const text = lines.join('\n');
    console.log(`[Briefing] Generated ${text.length} chars (${articles.length} articles)`);
    return text;
}

module.exports = { generateBriefing };
