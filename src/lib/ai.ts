import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-6';

export type ParsedReminder =
  | { ok: true; text: string; remindAtIso: string }
  | { ok: false; reason: string };

export async function parseReminder(userMessage: string, nowIso: string, tz: string): Promise<ParsedReminder> {
  const sys = `You extract reminders from SMS. Output ONLY JSON, no prose.
Schema: {"ok": true, "text": string, "remind_at": ISO8601 with offset} OR {"ok": false, "reason": string}.
"text" is a short phrase describing what to remind about (e.g., "hair appointment").
"remind_at" is the absolute time the user wants the reminder fired, computed from the user's local timezone (${tz}).
Current time: ${nowIso}.
If no clear time is given, return ok:false with a brief reason.`;

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: sys,
    messages: [{ role: 'user', content: userMessage }],
  });
  const block = res.content.find((b) => b.type === 'text');
  const raw = block && 'text' in block ? block.text.trim() : '';
  const json = raw.replace(/^```json\s*|\s*```$/g, '');
  try {
    const parsed = JSON.parse(json);
    if (parsed.ok === true && parsed.text && parsed.remind_at) {
      return { ok: true, text: parsed.text, remindAtIso: parsed.remind_at };
    }
    return { ok: false, reason: parsed.reason || 'Could not parse a time.' };
  } catch {
    return { ok: false, reason: 'Could not understand that. Try: "remind me about my hair appointment in 1 hour".' };
  }
}

export async function craftReminderMessage(reminderText: string, remindAt: Date): Promise<string> {
  const minsUntil = Math.round((remindAt.getTime() - Date.now()) / 60000);
  const sys = `You write a single short, friendly SMS reminder. No greeting, no emoji, no quotes. Under 140 chars.`;
  const user = `Remind the user about: "${reminderText}". It is happening ${
    minsUntil <= 0 ? 'now' : `in about ${humanizeMinutes(minsUntil)}`
  }.`;
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 120,
    system: sys,
    messages: [{ role: 'user', content: user }],
  });
  const block = res.content.find((b) => b.type === 'text');
  return block && 'text' in block ? block.text.trim() : `Reminder: ${reminderText}`;
}

export async function chatReply(userMessage: string): Promise<string> {
  const sys = `You are RemindMe, a friendly SMS reminder bot. The user texted you something that isn't a reminder request.
Reply naturally and conversationally in 1-2 short sentences. Be warm and human, not robotic.
If it makes sense, gently nudge them toward what you do (remind them about things at specific times) — but don't force it on every reply.
No emojis. No quotes. Under 160 characters. Just the reply text.`;
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 150,
    system: sys,
    messages: [{ role: 'user', content: userMessage }],
  });
  const block = res.content.find((b) => b.type === 'text');
  return block && 'text' in block
    ? block.text.trim()
    : `Hi! Text me something you want to be reminded of and I'll ping you when it's time.`;
}

function humanizeMinutes(mins: number) {
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const h = Math.round(mins / 60);
  return `${h} hour${h === 1 ? '' : 's'}`;
}
