// Vercel Serverless Function: /api/nvidia
// 主力 — NVIDIA 免費 API 代理（出題用）
const BASE = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODELS = ['nvidia/llama-3.3-nemotron-super-49b-v1','google/gemma-3n-e4b-it','minimaxai/minimax-m2.7'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const { prompt, apiKey } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  const key = apiKey || process.env.NVIDIA_API_KEY;
  if (!key) return res.status(500).json({ error: 'NVIDIA_API_KEY not set' });

  for (const model of MODELS) {
    try {
      const result = await callModel(model, prompt, key);
      return res.json(result);
    } catch (e) {
      if (e.status === 429) continue;
      return res.status(500).json({ error: e.message });
    }
  }
  return res.status(429).json({ error: 'All models rate limited', retryAfter: 5 });
};

async function callModel(model, prompt, key) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 60000);
  try {
    const r = await fetch(BASE, {
      method: 'POST', signal: c.signal,
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.9, max_tokens: 8192 })
    });
    if (r.status === 429) throw { status: 429 };
    if (!r.ok) { const text = await r.text().catch(() => ''); throw new Error('NVIDIA ' + r.status + ': ' + text.slice(0, 200)); }
    const data = await r.json();
    let text = data.choices?.[0]?.message?.content || '';
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(text);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('NVIDIA timeout');
    if (e.status === 429) throw e;
    throw e;
  } finally { clearTimeout(t); }
}
