import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export const pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== 'production') global.__pgPool = pool;

export type Reminder = {
  id: string;
  user_phone: string;
  text: string;
  remind_at: Date;
  created_at: Date;
  sent_at: Date | null;
};

export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reminders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_phone TEXT NOT NULL,
      text TEXT NOT NULL,
      remind_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      sent_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS reminders_due_idx
      ON reminders (remind_at) WHERE sent_at IS NULL;
  `);
}

export async function insertReminder(userPhone: string, text: string, remindAt: Date) {
  const { rows } = await pool.query<Reminder>(
    `INSERT INTO reminders (user_phone, text, remind_at) VALUES ($1, $2, $3) RETURNING *`,
    [userPhone, text, remindAt],
  );
  return rows[0];
}

export async function fetchDueReminders(now: Date) {
  const { rows } = await pool.query<Reminder>(
    `SELECT * FROM reminders WHERE sent_at IS NULL AND remind_at <= $1 ORDER BY remind_at ASC LIMIT 50`,
    [now],
  );
  return rows;
}

export async function markSent(id: string) {
  await pool.query(`UPDATE reminders SET sent_at = now() WHERE id = $1`, [id]);
}
