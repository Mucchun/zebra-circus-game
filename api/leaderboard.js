// Vercel Serverless Function — game leaderboard (Neon Postgres).
//   POST { name, email, score, level }  → record a score
//   GET  ?format=json                   → top 20 as JSON (default)
//   GET                                  → top 20 as an HTML page
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

let ensured = false;
async function ensureTable(sql) {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS scores (
      id         BIGSERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT,
      score      INTEGER NOT NULL,
      level      INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  ensured = true;
}

export default async function handler(req, res) {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return res.status(500).json({ error: 'database_not_configured' });
  const sql = neon(url);

  try {
    await ensureTable(sql);

    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const name = String(b.name || 'Player').trim().slice(0, 40) || 'Player';
      const email = String(b.email || '').trim().slice(0, 120);
      const score = Math.max(0, Math.min(10000000, parseInt(b.score, 10) || 0));
      const level = Math.max(1, Math.min(3, parseInt(b.level, 10) || 1));
      const rows = await sql`INSERT INTO scores (name, email, score, level) VALUES (${name}, ${email}, ${score}, ${level}) RETURNING id`;
      // The player's rank for this score.
      const rank = await sql`SELECT COUNT(*)::int AS n FROM scores WHERE score > ${score}`;
      return res.status(200).json({ ok: true, id: rows[0]?.id, rank: rank[0].n + 1 });
    }

    // Top scores (best per name).
    const top = await sql`
      SELECT DISTINCT ON (name) name, score, level, created_at
      FROM scores ORDER BY name, score DESC`;
    top.sort((a, b) => b.score - a.score);
    const list = top.slice(0, 20);

    if ((req.query && req.query.format) === 'json' || (req.headers.accept || '').includes('application/json')) {
      return res.status(200).json({ leaderboard: list });
    }

    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const rows = list.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.score)}</td><td>L${esc(r.level)}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zebra Circus — Leaderboard</title><style>
  body{margin:0;background:#05050d;color:#d8ddf0;font:15px -apple-system,Segoe UI,Roboto,sans-serif}
  header{padding:18px 22px;border-bottom:2px solid #ff6a00} h1{margin:0;font-size:20px;letter-spacing:1px}
  table{width:100%;max-width:520px;margin:20px auto;border-collapse:collapse}
  th,td{padding:11px 16px;text-align:left;border-bottom:1px solid #14142a}
  th{color:#8090b0;font-size:12px;text-transform:uppercase;letter-spacing:1px}
  td:first-child{color:#ffd200;font-weight:800;width:44px}
  tr:hover td{background:#0b0b16}
</style></head><body>
<header><h1>🏆 ZEBRA CIRCUS — LEADERBOARD</h1></header>
${list.length ? `<table><thead><tr><th>#</th><th>Player</th><th>Score</th><th>Best level</th></tr></thead><tbody>${rows}</tbody></table>`
  : '<p style="text-align:center;color:#4a5070;margin-top:40px">No scores yet — be the first!</p>'}
</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
}
