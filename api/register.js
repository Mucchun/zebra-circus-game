// Vercel Serverless Function — stores a player registration (lead) in Neon Postgres.
// Table is created on first call. Env: DATABASE_URL (provisioned by the Neon integration).
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

let ensured = false;
async function ensureTable(sql) {
  if (ensured) return;
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
  // Prize columns so a player's win + shipping address sit next to their name.
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
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const firstName = String(body.firstName || '').trim().slice(0, 60);
    const lastName  = String(body.lastName  || '').trim().slice(0, 60);
    const email     = String(body.email     || '').trim().slice(0, 120);
    const phone     = String(body.phone     || '').trim().slice(0, 40);
    const consent   = body.consent === true;

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const phoneOk = phone.replace(/[^0-9]/g, '').length >= 6;
    if (!firstName || !lastName || !emailOk || !phoneOk || !consent) {
      return res.status(400).json({ error: 'invalid_fields' });
    }

    const sql = neon(url);
    await ensureTable(sql);
    const ua = String(req.headers['user-agent'] || '').slice(0, 300);
    const rows = await sql`
      INSERT INTO leads (first_name, last_name, email, phone, consent, user_agent)
      VALUES (${firstName}, ${lastName}, ${email}, ${phone}, ${consent}, ${ua})
      RETURNING id`;
    return res.status(200).json({ ok: true, id: rows[0]?.id });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
}
