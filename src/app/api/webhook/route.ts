import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { ensureSchema, insertReminder } from '@/lib/db';
import { parseReminder } from '@/lib/ai';
import { sendSms } from '@/lib/linq';

export const runtime = 'nodejs';

function verifySignature(rawBody: string, timestamp: string, signature: string) {
  const secret = process.env.LINQ_WEBHOOK_SIGNING_SECRET;
  if (!secret) return true; // dev fallback
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const event = req.headers.get('x-webhook-event');
  const timestamp = req.headers.get('x-webhook-timestamp') ?? '';
  const signature = req.headers.get('x-webhook-signature') ?? '';

  if (!verifySignature(raw, timestamp, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  if (event !== 'message.received') return NextResponse.json({ ok: true });

  const payload = JSON.parse(raw);
  const direction: string | undefined = payload.direction;
  if (direction && direction !== 'inbound') return NextResponse.json({ ok: true });

  const fromHandle: string | undefined = payload.sender_handle?.handle;
  const textPart = (payload.parts ?? []).find((p: { type: string }) => p.type === 'text');
  const userText: string | undefined = textPart?.value;
  if (!fromHandle || !userText) return NextResponse.json({ ok: true });

  await ensureSchema();

  const tz = process.env.DEFAULT_TZ || 'America/New_York';
  const parsed = await parseReminder(userText, new Date().toISOString(), tz);

  if (!parsed.ok) {
    await sendSms(fromHandle, parsed.reason);
    return NextResponse.json({ ok: true });
  }

  const remindAt = new Date(parsed.remindAtIso);
  await insertReminder(fromHandle, parsed.text, remindAt);
  await sendSms(
    fromHandle,
    `Got it. I'll remind you about ${parsed.text} at ${remindAt.toLocaleString('en-US', { timeZone: tz })}.`,
  );

  return NextResponse.json({ ok: true });
}
