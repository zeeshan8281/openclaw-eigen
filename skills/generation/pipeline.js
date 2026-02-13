const axios = require('axios');
require('dotenv').config();

const OLLAMA_BASE = 'http://localhost:11434/api/generate';
const EIGEN_API_BASE = process.env.EIGEN_API_BASE || 'https://api.eigencloud.xyz/v1';
const EIGEN_API_KEY = process.env.EIGEN_API_KEY;

/**
 * Agent 1: SEO Researcher (Ollama)
 */
async function runResearcher(brief) {
    console.log("--- Starting Research Phase (Ollama) ---");
    const prompt = `You are an SEO Researcher. Given this brief: "${brief}", research the top technical concepts, keywords, and user intents. Provide a structured research note with key takeaways and an outline.`;

    const response = await axios.post(OLLAMA_BASE, {
        model: "qwen3:32b",
        prompt: prompt,
        stream: false
    });

    return response.data.response;
}

/**
 * Agent 2: Draft Writer (Ollama)
 */
async function runWriter(research) {
    console.log("--- Starting Writing Phase (Ollama) ---");
    const prompt = `You are a Technical Content Writer. Use this research to write a 2000+ word technical guide: ${research}. Focus on depth, clarity, and developer-centric language.`;

    const response = await axios.post(OLLAMA_BASE, {
        model: "qwen3:32b",
        prompt: prompt,
        stream: false
    });

    return response.data.response;
}

/**
 * Agent 3: Verifier Pass (EigenAI)
 */
async function runVerifier(draft) {
    console.log("--- Starting Verification Phase (EigenAI) ---");
    if (!EIGEN_API_KEY) {
        console.warn("No EigenAI Key found. Skipping cryptographic verification.");
        return { content: draft, proof: null };
    }

    const response = await axios.post(`${EIGEN_API_BASE}/chat/completions`, {
        model: "gpt-oss-120b-f16",
        messages: [
            { role: "system", content: "You are a senior technical editor. Polish this technical article for clarity, accuracy, and SEO. Return the final version." },
            { role: "user", content: draft }
        ],
        seed: 42
    }, {
        headers: { 'Authorization': `Bearer ${EIGEN_API_KEY}` }
    });

    // The response includes verification metadata in headers or body depending on EigenAI API spec
    // Assuming standard OpenAI-compatible body with additional fields
    const content = response.data.choices[0].message.content;
    const proof = {
        model_digest: response.data.model_digest,
        prompt_hash: response.data.prompt_hash,
        response_hash: response.data.response_hash,
        eigenda_blob_id: response.data.eigenda_blob_id,
        timestamp: new Date().toISOString()
    };

    return { content, proof };
}

async function mainPipeline(brief) {
    try {
        const research = await runResearcher(brief);
        const draft = await runWriter(research);
        const { content, proof } = await runVerifier(draft);

        console.log("--- Pipeline Complete ---");
        return { content, proof };
    } catch (error) {
        console.error("Pipeline Error:", error.message);
    }
}

module.exports = { mainPipeline };
