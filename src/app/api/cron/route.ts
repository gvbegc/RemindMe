import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, fetchDueReminders, markSent } from '@/lib/db';
import { craftReminderMessage } from '@/lib/ai';
import { sendSms } from '@/lib/linq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  await ensureSchema();
  const due = await fetchDueReminders(new Date());

  const results = await Promise.allSettled(
    due.map(async (r) => {
      const text = await craftReminderMessage(r.text, r.remind_at);
      await sendSms(r.user_phone, text);
      await markSent(r.id);
      return r.id;
    }),
  );

  return NextResponse.json({
    fired: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
  });
}
