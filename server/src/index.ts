import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { verifyWebhookChallenge, validateMetaSignature, parseWaMessages } from './integrations/whatsapp/webhook.js';
import { analyzeIncomingMessage, buildSummaryCards, deduplicateMessages, type DeadlineRecord, type NormalizedMessage, type Source, type TaskRecord } from './services/analysis.js';
import { askQuestion, analyzeWithGemini } from './services/ai.js';
import { realtime } from './services/realtime.js';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const whatsappWebhookPort = Number(process.env.WHATSAPP_WEBHOOK_PORT ?? 3002);
const state = {
  messages: [] as NormalizedMessage[],
  tasks: [] as TaskRecord[],
  deadlines: [] as DeadlineRecord[],
  lastWhatsAppEventAt: null as number | null,
  lastAndroidEventAt: null as number | null,
  lastTelegramEventAt: null as number | null,
};
const analysisQueue: NormalizedMessage[] = [];
const queuedMessageIds = new Set<string>();
let queueRunning = false;
const MAX_ANALYSIS_QUEUE = 100;

const origin = process.env.WEB_APP_ORIGIN ?? 'http://localhost:5173';

app.use(
  cors({
    origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }),
);

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const unsubscribe = realtime.subscribe((payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  });

  res.write(`data: ${JSON.stringify({ type: 'connection', status: 'connected' })}\n\n`);

  req.on('close', () => {
    unsubscribe();
  });
});

app.get('/api/messages', (_req: Request, res: Response) => {
  res.json(state.messages.slice(0, 20));
});

app.get('/api/state', (_req: Request, res: Response) => {
  res.json({ messages: state.messages.slice(0, 25), tasks: state.tasks, deadlines: state.deadlines });
});

app.delete('/api/conversations/:conversationId', (req: Request, res: Response) => {
  const conversationId = req.params.conversationId;
  const before = state.messages.length;
  state.messages = state.messages.filter((message) => message.conversationId !== conversationId);
  const remainingMessageIds = new Set(state.messages.map((message) => message.id));
  state.tasks = state.tasks.filter((task) => remainingMessageIds.has(task.messageId));
  state.deadlines = state.deadlines.filter((deadline) => remainingMessageIds.has(deadline.messageId));
  if (before === state.messages.length) {
    res.status(404).json({ error: 'Conversation not found.' });
    return;
  }

  realtime.broadcast({ type: 'conversation-deleted', conversationId });
  res.json({ deleted: true, conversationId });
});

app.get('/api/summary', (_req: Request, res: Response) => {
  res.json({ cards: buildSummaryCards(state.messages) });
});

app.get('/api/tasks', (_req: Request, res: Response) => {
  res.json(state.tasks);
});

app.post('/api/tasks/:id/toggle', (req: Request, res: Response) => {
  const task = state.tasks.find((item) => item.id === req.params.id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  task.done = !task.done;
  realtime.broadcast({ type: 'task', task });
  res.json({ success: true, task });
});

app.get('/api/integrations', (_req: Request, res: Response) => {
  res.json({
    whatsapp: {
      configured: Boolean(process.env.META_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN),
      status: state.lastWhatsAppEventAt ? 'receiving' : process.env.META_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN ? 'awaiting webhook' : 'needs setup',
      lastEventAt: state.lastWhatsAppEventAt,
      personalInboxSupported: false,
    },
    android: {
      configured: Boolean(process.env.COMPANION_AUTH_SECRET),
      status: state.lastAndroidEventAt ? 'receiving' : process.env.COMPANION_AUTH_SECRET ? 'awaiting device' : 'needs setup',
      lastEventAt: state.lastAndroidEventAt,
    },
    telegram: {
      configured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      status: state.lastTelegramEventAt ? 'receiving' : process.env.TELEGRAM_WEBHOOK_SECRET ? 'awaiting webhook' : 'needs setup',
      lastEventAt: state.lastTelegramEventAt,
    },
    slack: {
      configured: false,
      status: 'scaffold-only',
      method: 'Slack Events API (not implemented)',
    },
    email: {
      configured: false,
      status: 'scaffold-only',
      method: 'Gmail or Microsoft Graph OAuth (not implemented)',
    },
  });
});

app.post('/api/analyze', async (req: Request, res: Response) => {
  const payload = req.body as { text?: string; sender?: string; source?: Source; conversationId?: string };
  if (!payload.text) {
    res.status(400).json({ error: 'Missing message text' });
    return;
  }

  const message = analyzeIncomingMessage({
    source: payload.source ?? 'generic',
    sender: payload.sender ?? 'User',
    conversationId: payload.conversationId,
    text: payload.text,
  });

  if (!enqueueMessage(message)) {
    res.status(429).json({ error: 'Analysis queue is full or this message was already received.' });
    return;
  }
  res.status(202).json({ accepted: true, id: message.id });
});

app.post('/api/ask', async (req: Request, res: Response) => {
  const question = typeof req.body?.question === 'string' ? req.body.question : '';
  if (!question.trim()) {
    res.status(400).json({ error: 'Question is required.' });
    return;
  }

  res.json({ answer: await askQuestion(question, state.messages, state.tasks, state.deadlines) });
});

function handleWhatsAppWebhook(req: Request, res: Response) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.headers['x-hub-signature-256'];
  const valid = validateMetaSignature(rawBody, typeof signature === 'string' ? signature : undefined);

  if (!valid) {
    res.sendStatus(403);
    return;
  }

  try {
    const payload = JSON.parse(rawBody.toString() || '{}');
    const parsedMessages = parseWaMessages(payload);
    if (parsedMessages.length) state.lastWhatsAppEventAt = Date.now();
    res.sendStatus(200);

    for (const parsed of parsedMessages) {
      const message = analyzeIncomingMessage({
        id: parsed.id,
        conversationId: parsed.conversationId,
        sender: parsed.sender,
        source: 'whatsapp',
        text: parsed.text,
        timestamp: parsed.timestamp,
      });
      enqueueMessage(message);
    }
  } catch (error) {
    console.error('Webhook processing failed', error);
    if (!res.headersSent) res.sendStatus(400);
  }
}

const whatsappWebhookApp = express();
whatsappWebhookApp.get('/webhooks/whatsapp', verifyWebhookChallenge);
whatsappWebhookApp.post('/webhooks/whatsapp', express.raw({ type: 'application/json', limit: '1mb' }), handleWhatsAppWebhook);
whatsappWebhookApp.post('/webhook/telegram', express.json({ limit: '1mb' }), (req: Request, res: Response) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const supplied = req.headers['x-telegram-bot-api-secret-token'];
  if (!secret || typeof supplied !== 'string' || !secureEquals(secret, supplied)) {
    res.sendStatus(403);
    return;
  }

  const message = req.body?.message ?? req.body?.channel_post;
  if (typeof message?.text !== 'string' || !message.text.trim()) {
    res.sendStatus(200);
    return;
  }

  const author = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ')
    || message.chat?.title
    || 'Telegram User';
  const id = req.body?.update_id !== undefined
    ? `telegram-${req.body.update_id}`
    : message.message_id !== undefined
      ? `telegram-${message.chat?.id ?? 'chat'}-${message.message_id}`
      : undefined;
  const normalized = analyzeIncomingMessage({
    id,
    source: 'telegram',
    sender: author,
    conversationId: String(message.chat?.id ?? author),
    text: message.text,
    timestamp: typeof message.date === 'number' ? message.date * 1000 : Date.now(),
  });

  state.lastTelegramEventAt = Date.now();
  enqueueMessage(normalized);
  res.sendStatus(200);
});

app.post('/api/companion/events', (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  const secret = process.env.COMPANION_AUTH_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'Android companion is not configured on this server.' });
    return;
  }

  if (typeof auth !== 'string' || !secureEquals(`Bearer ${secret}`, auth)) {
    res.sendStatus(401);
    return;
  }

  const payload = req.body as { id?: string; conversationId?: string; text?: string; sender?: string; source?: Source };
  if (!payload.text) {
    res.status(400).json({ error: 'Missing companion message text.' });
    return;
  }

  const message = analyzeIncomingMessage({
    id: typeof req.body?.id === 'string' ? req.body.id : undefined,
    conversationId: payload.conversationId,
    source: 'android',
    sender: payload.sender ?? 'Android Companion',
    text: payload.text,
  });

  state.lastAndroidEventAt = Date.now();
  const accepted = enqueueMessage(message);
  res.status(accepted ? 202 : 429).json(accepted ? { ok: true, accepted: true, id: message.id } : { error: 'Analysis queue is full or this message was already received.' });
});

app.post('/webhook/generic', (req: Request, res: Response) => {
  const secret = process.env.GENERIC_WEBHOOK_SECRET ?? process.env.COMPANION_AUTH_SECRET;
  const auth = req.headers.authorization;
  if (!secret || typeof auth !== 'string' || !secureEquals(`Bearer ${secret}`, auth)) {
    res.sendStatus(secret ? 401 : 503);
    return;
  }

  const payload = req.body as { id?: string; conversationId?: string; author?: string; text?: string; source?: string };
  if (typeof payload.text !== 'string' || !payload.text.trim()) {
    res.status(400).json({ error: 'Text field is required.' });
    return;
  }

  const message = analyzeIncomingMessage({
    id: payload.id,
    conversationId: payload.conversationId,
    source: 'generic',
    sender: payload.author?.slice(0, 120) || 'App User',
    text: payload.text.slice(0, 4_000),
  });
  const accepted = enqueueMessage(message);
  res.status(accepted ? 202 : 429).json(accepted ? { success: true, accepted: true, id: message.id } : { error: 'Analysis queue is full or this message was already received.' });
});

app.post('/api/privacy/clear', (_req: Request, res: Response) => {
  state.messages = [];
  state.tasks = [];
  state.deadlines = [];
  realtime.broadcast({ type: 'clear', cleared: true });
  res.json({ ok: true });
});

function enqueueMessage(message: NormalizedMessage) {
  if (!deduplicateMessages(state.messages, message) || queuedMessageIds.has(message.id)) return false;
  if (analysisQueue.length >= MAX_ANALYSIS_QUEUE) return false;

  queuedMessageIds.add(message.id);
  analysisQueue.push(message);
  void processAnalysisQueue();
  return true;
}

async function processAnalysisQueue() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    while (analysisQueue.length) {
      const message = analysisQueue.shift()!;
      try {
        const enriched = await analyzeWithGemini(message);
        storeMessage(enriched ?? message);
      } catch {
        storeMessage(message);
      } finally {
        queuedMessageIds.delete(message.id);
      }
    }
  } finally {
    queueRunning = false;
  }
}

function storeMessage(message: NormalizedMessage) {
  if (!deduplicateMessages(state.messages, message)) return;

  state.messages = [message, ...state.messages].slice(0, 25);
  const messageTasks = message.action_items.map((title, index) => ({
    id: `${message.id}-task-${index}`,
    messageId: message.id,
    title,
    detail: `From ${message.sender} · ${message.source}`,
    due: message.deadlines[0] ?? 'Unspecified',
    done: false,
    source: message.source,
    priority: message.priority,
  }));
  const messageDeadlines = message.deadlines.map((when, index) => ({
    id: `${message.id}-deadline-${index}`,
    messageId: message.id,
    title: message.category === 'deadline' ? message.summary : 'Time-sensitive message',
    when,
    detail: message.text,
    source: message.source,
    priority: message.priority,
  }));
  state.tasks = [...messageTasks, ...state.tasks].slice(0, 100);
  state.deadlines = [...messageDeadlines, ...state.deadlines].slice(0, 100);
  realtime.broadcast({ type: 'message', message, tasks: messageTasks, deadlines: messageDeadlines });
}

function secureEquals(expectedValue: string, suppliedValue: string) {
  const expected = Buffer.from(expectedValue);
  const supplied = Buffer.from(suppliedValue);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

app.listen(port, () => {
  console.log(`What Did I Miss backend listening on http://localhost:${port}`);
});

whatsappWebhookApp.listen(whatsappWebhookPort, () => {
  console.log(`WhatsApp-only webhook listener on http://localhost:${whatsappWebhookPort}`);
});
