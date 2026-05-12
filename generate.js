// Vercel Serverless Function: /api/generate
// Post JSON: { prompt: string, model?: 'groq' | 'openrouter' }
// Returns: { questions: [...] } — same format as direct API
//
// Environment variables (set in Vercel Dashboard):
//   GROQ_API_KEY        — Groq API Key (recommended, faster)
//   OPENROUTER_API_KEY  — OpenRouter API Key (fallback)

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT = 55000;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  const { prompt, model } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  const groqKey = process.env.GROQ_API_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;

  // Try Groq first (fast), fallback to OpenRouter
  if (!model || model === 'groq') {
    if (groqKey) {
      try {
        const result = await callGroq(prompt, groqKey);
        return res.json(result);
      } catch (e) {
        if (e.status === 429 && orKey) {
          // fall through to OpenRouter
        } else if (e.status === 429) {
          return res.status(429).json({ error: 'Groq rate limited, no fallback' });
        } else {
          return res.status(500).json({ error: e.message });
        }
      }
    }
  }

  if (orKey) {
    try {
      const result = await callOpenRouter(prompt, orKey);
      return res.json(result);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(500).json({ error: 'No API keys configured. Set GROQ_API_KEY or OPENROUTER_API_KEY in Vercel env.' });
}

async function callGroq(prompt, key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST', signal: controller.signal,
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9, max_tokens: 8192
      })
    });
    if (r.status === 429) throw { status: 429, message: 'Groq quota exceeded' };
    if (!r.ok) throw new Error('Groq error: ' + r.status);
    const data = await r.json();
    let text = data.choices?.[0]?.message?.content || '';
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(text);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Groq timeout');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenRouter(prompt, key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const r = await fetch(OPENROUTER_URL, {
      method: 'POST', signal: controller.signal,
      headers: {
        'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json',
        'HTTP-Referer': 'https://' + (process.env.VERCEL_URL || 'ai-quiz.vercel.app'),
        'X-Title': 'AIQuiz'
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9, max_tokens: 8192
      })
    });
    if (r.status === 429) throw { status: 429, message: 'OpenRouter quota exceeded' };
    if (!r.ok) throw new Error('OpenRouter error: ' + r.status);
    const data = await r.json();
    let text = data.choices?.[0]?.message?.content || '';
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(text);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('OpenRouter timeout');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
