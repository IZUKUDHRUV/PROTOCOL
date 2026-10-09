import crypto from 'node:crypto';
import type { Request, Response } from 'express';

export function verifyWebhookChallenge(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (verifyToken && mode === 'subscribe' && token === verifyToken) {
    res.status(200).send(String(challenge ?? ''));
    return;
  }

  res.sendStatus(403);
}

export function validateMetaSignature(rawBody: Buffer, signature?: string) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signature) return false;

  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  if (expected.length !== signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function parseWaMessages(rawPayload: unknown) {
  const payload = rawPayload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
          messages?: Array<{
            id?: string;
            from?: string;
            text?: { body?: string };
            timestamp?: string;
          }>;
        };
      }>;
    }>;
  };

  return (payload.entry ?? []).flatMap((entry) =>
    (entry.changes ?? []).flatMap((change) =>
      (change.value?.messages ?? [])
        .filter((message) => typeof message.text?.body === 'string' && message.text.body.trim().length > 0)
        .map((message) => {
          const contact = change.value?.contacts?.find((item) => item.wa_id === message.from);
          return {
            id: message.id ?? crypto.randomUUID(),
            conversationId: message.from ?? 'unknown',
            sender: contact?.profile?.name ?? message.from ?? 'unknown',
            text: message.text!.body!,
            timestamp: Number(message.timestamp ?? Date.now() / 1000) * 1000,
          };
        }),
    ),
  );
}
