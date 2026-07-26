// Vercel Serverless Function — export captured leads as CSV (protected).
// Access: GET /api/leads?key=YOUR_KEY  — set LEADS_EXPORT_KEY in env.
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export default async function handler(req, res) {
  const key = process.env.LEADS_EXPORT_KEY;
  const provided = (req.query && req.query.key) || '';
  if (!key || provided !== key) return res.status(401).json({ error: 'unauthorized' });

  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return res.status(500).json({ error: 'database_not_configured' });

  try {
    const sql = neon(url);
    const rows = await sql`
      SELECT id, first_name, last_name, email, phone, consent, created_at
      FROM leads ORDER BY created_at DESC LIMIT 5000`;
    const header = ['id', 'first_name', 'last_name', 'email', 'phone', 'consent', 'created_at'];
    const lines = [header.join(',')];
    for (const r of rows) lines.push(header.map((h) => csvCell(r[h])).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="zebra-leads.csv"');
    return res.status(200).send(lines.join('\n'));
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
}
