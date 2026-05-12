import LinqAPIV3 from '@linqapp/sdk';

export const linq = new LinqAPIV3({ apiKey: process.env.LINQ_API_V3_API_KEY });

export async function sendSms(to: string, text: string) {
  return linq.chats.create({
    from: process.env.LINQ_FROM_NUMBER!,
    to: [to],
    message: { parts: [{ type: 'text', value: text }] },
  });
}
