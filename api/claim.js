// Vercel Serverless Function — stores a physical-prize claim (address + voucher)
// in Neon Postgres. Table auto-created. Env: DATABASE_URL.
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

let ensured = false;
async function ensureTable(sql) {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS claims (
      id         BIGSERIAL PRIMARY KEY,
      coupon     TEXT,
      prize      TEXT NOT NULL,
      full_name  TEXT NOT NULL,
      address    TEXT NOT NULL,
      city       TEXT NOT NULL,
      postcode   TEXT NOT NULL,
      country    TEXT NOT NULL,
      email      TEXT,
      shipped    BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  // The leads table (created by /api/register) needs these columns so the
  // UPDATE below can attach the win + address to the player row.
  await sql`CREATE TABLE IF NOT EXISTS leads (id BIGSERIAL PRIMARY KEY, email TEXT)`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS won_prize    TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS won_coupon   TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ship_address TEXT`;
  ensured = true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return res.status(500).json({ error: 'database_not_configured' });

  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const s = (v, n) => String(v || '').trim().slice(0, n);
    const coupon = s(b.coupon, 40);
    const prize = s(b.prize, 60) || 'Zebra Plushie';
    const fullName = s(b.fullName, 80);
    const address = s(b.address, 160);
    const city = s(b.city, 80);
    const postcode = s(b.postcode, 20);
    const country = s(b.country, 60);
    const email = s(b.email, 120);
    if (!fullName || !address || !city || !postcode || !country) {
      return res.status(400).json({ error: 'invalid_fields' });
    }
    const sql = neon(url);
    await ensureTable(sql);
    const rows = await sql`
      INSERT INTO claims (coupon, prize, full_name, address, city, postcode, country, email)
      VALUES (${coupon}, ${prize}, ${fullName}, ${address}, ${city}, ${postcode}, ${country}, ${email})
      RETURNING id`;
    // Enrich the matching registration row so the win sits next to the player.
    if (email) {
      const fullAddress = [address, city, postcode, country].filter(Boolean).join(', ');
      try {
        await sql`
          UPDATE leads
          SET won_prize = ${prize}, won_coupon = ${coupon}, ship_address = ${fullAddress}
          WHERE lower(email) = lower(${email})`;
      } catch (_) { /* leads columns may be missing on older DBs */ }
    }
    return res.status(200).json({ ok: true, id: rows[0]?.id });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
}
