// Vercel Serverless Function: /api/nvidia-fast
// 備援 — NVIDIA Gemma 模型代理
const BASE = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = 'google/gemma-3n-e4b-it';

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

  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 30000);
  try {
    const r = await fetch(BASE, {
      method: 'POST', signal: c.signal,
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.20, top_p: 0.70, max_tokens: 4096 })
    });
    if (r.status === 429) return res.status(429).json({ error: 'Rate limited', retryAfter: 3 });
    if (!r.ok) { const text = await r.text().catch(() => ''); return res.status(500).json({ error: 'NVIDIA ' + r.status + ': ' + text.slice(0, 200) }); }
    const data = await r.json();
    let text = data.choices?.[0]?.message?.content || '';
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return res.json(JSON.parse(text));
  } catch (e) {
    if (e.name === 'AbortError') return res.status(504).json({ error: 'Timeout' });
    return res.status(500).json({ error: e.message });
  } finally { clearTimeout(t); }
};
