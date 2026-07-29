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
  // Keep the leads schema identical to /api/register's so whichever function
  // runs first creates the same table (a minimal CREATE here used to leave
  // register's INSERT failing when a claim arrived on a fresh database).
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id          BIGSERIAL PRIMARY KEY,
      first_name  TEXT NOT NULL,
      last_name   TEXT NOT NULL,
      email       TEXT NOT NULL,
      phone       TEXT NOT NULL,
      consent     BOOLEAN NOT NULL DEFAULT TRUE,
      user_agent  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS won_prize    TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS won_coupon   TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ship_address TEXT`;
  ensured = true;
}

export default async function handler(req, res) {
  // Allow the desktop/localhost build (different origin) to post claims here.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
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
    // Basic abuse guards: claims must come from a registered player and carry
    // a coupon in the game's ZC- voucher format.
    if (!email) return res.status(403).json({ error: 'missing_email' });
    if (coupon && !/^ZC-[A-Z0-9-]{3,36}$/.test(coupon)) {
      return res.status(400).json({ error: 'invalid_coupon' });
    }
    const sql = neon(url);
    await ensureTable(sql);
    const player = await sql`SELECT id FROM leads WHERE lower(email) = lower(${email}) LIMIT 1`;
    if (!player.length) return res.status(403).json({ error: 'unregistered_player' });
    const rows = await sql`
      INSERT INTO claims (coupon, prize, full_name, address, city, postcode, country, email)
      VALUES (${coupon}, ${prize}, ${fullName}, ${address}, ${city}, ${postcode}, ${country}, ${email})
      RETURNING id`;
    // Enrich the registration row so the win sits next to the player. Append
    // additional prizes (Level 1 plushie + Level 2 barcode reader) instead of
    // overwriting, skipping duplicates on repeat submissions.
    const fullAddress = [address, city, postcode, country].filter(Boolean).join(', ');
    await sql`
      UPDATE leads SET
        won_prize = CASE
          WHEN won_prize IS NULL OR won_prize = '' THEN ${prize}
          WHEN POSITION(${prize} IN won_prize) > 0 THEN won_prize
          ELSE won_prize || ' + ' || ${prize} END,
        won_coupon = CASE
          WHEN won_coupon IS NULL OR won_coupon = '' THEN ${coupon}
          WHEN POSITION(${coupon} IN won_coupon) > 0 THEN won_coupon
          ELSE won_coupon || ' + ' || ${coupon} END,
        ship_address = ${fullAddress}
      WHERE lower(email) = lower(${email})`;
    return res.status(200).json({ ok: true, id: rows[0]?.id });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
}
