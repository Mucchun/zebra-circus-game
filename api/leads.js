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
    let rows;
    try {
      rows = await sql`
        SELECT id, first_name, last_name, email, phone, consent, won_prize, won_coupon, ship_address, created_at
        FROM leads ORDER BY created_at DESC LIMIT 5000`;
    } catch (_) {
      rows = await sql`
        SELECT id, first_name, last_name, email, phone, consent, created_at
        FROM leads ORDER BY created_at DESC LIMIT 5000`;
    }
    let claims = [];
    try {
      claims = await sql`
        SELECT id, coupon, prize, full_name, address, city, postcode, country, email, created_at
        FROM claims ORDER BY created_at DESC LIMIT 5000`;
    } catch (_) { /* claims table may not exist yet */ }
    const header = ['id', 'first_name', 'last_name', 'email', 'phone', 'consent', 'created_at'];

    // CSV download when ?format=csv
    if ((req.query && req.query.format) === 'csv') {
      const lines = [header.join(',')];
      for (const r of rows) lines.push(header.map((h) => csvCell(r[h])).join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="zebra-leads.csv"');
      return res.status(200).send(lines.join('\n'));
    }

    // Otherwise render a viewable HTML dashboard.
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const key = encodeURIComponent(provided);
    const trs = rows.map((r) => `<tr>
      <td>${esc(r.id)}</td><td>${esc(r.first_name)}</td><td>${esc(r.last_name)}</td>
      <td><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></td>
      <td>${esc(r.phone)}</td><td>${r.consent ? '✓' : ''}</td>
      <td>${r.won_prize ? '<b style="color:#ffd200">' + esc(r.won_prize) + '</b>' : ''}</td>
      <td>${esc(r.won_coupon || '')}</td>
      <td style="max-width:220px;white-space:normal">${esc(r.ship_address || '')}</td>
      <td>${esc(new Date(r.created_at).toLocaleString())}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zebra Circus — Player Leads</title>
<style>
  body{margin:0;background:#05050d;color:#d8ddf0;font:14px -apple-system,Segoe UI,Roboto,sans-serif}
  header{display:flex;align-items:center;justify-content:space-between;gap:12px;
    padding:16px 22px;border-bottom:2px solid #00a651;flex-wrap:wrap}
  h1{font-size:18px;margin:0;letter-spacing:1px}
  .count{color:#00c060;font-weight:700}
  .btns a{display:inline-block;background:#00a651;color:#fff;text-decoration:none;
    padding:8px 14px;font-weight:700;font-size:13px;margin-left:8px}
  .btns a.ghost{background:transparent;border:1px solid #2a2a44;color:#8090b0}
  table{width:100%;border-collapse:collapse}
  th,td{padding:10px 14px;text-align:left;border-bottom:1px solid #14142a;white-space:nowrap}
  th{position:sticky;top:0;background:#0b0b16;color:#8090b0;font-size:11px;letter-spacing:1px;text-transform:uppercase}
  tr:hover td{background:#0b0b16}
  a{color:#4aa3ff}
  .empty{padding:40px;text-align:center;color:#4a5070}
</style></head><body>
<header>
  <h1>🦓 ZEBRA CIRCUS — PLAYER LEADS <span class="count">(${rows.length})</span></h1>
  <div class="btns">
    <a href="?key=${key}">↻ Refresh</a>
    <a class="ghost" href="?key=${key}&format=csv">⤓ Download CSV</a>
  </div>
</header>
${rows.length ? `<table><thead><tr>
  <th>ID</th><th>First</th><th>Surname</th><th>Email</th><th>Phone</th><th>Consent</th><th>Won</th><th>Voucher</th><th>Ship to</th><th>Registered</th>
</tr></thead><tbody>${trs}</tbody></table>` : '<div class="empty">No players have signed in yet.</div>'}
<header style="border-top:2px solid #ffd200;border-bottom:none;margin-top:24px">
  <h1>🎁 PRIZE CLAIMS <span class="count" style="color:#ffd200">(${claims.length})</span></h1>
</header>
${claims.length ? `<table><thead><tr>
  <th>ID</th><th>Voucher</th><th>Prize</th><th>Name</th><th>Address</th><th>City</th><th>Postcode</th><th>Country</th><th>Email</th><th>Claimed</th>
</tr></thead><tbody>${claims.map((c) => `<tr>
  <td>${esc(c.id)}</td><td>${esc(c.coupon)}</td><td>${esc(c.prize)}</td><td>${esc(c.full_name)}</td>
  <td>${esc(c.address)}</td><td>${esc(c.city)}</td><td>${esc(c.postcode)}</td><td>${esc(c.country)}</td>
  <td>${esc(c.email)}</td><td>${esc(new Date(c.created_at).toLocaleString())}</td></tr>`).join('')}</tbody></table>`
  : '<div class="empty">No prize claims yet.</div>'}
</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
}
