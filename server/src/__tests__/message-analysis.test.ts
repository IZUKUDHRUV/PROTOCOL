import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeIncomingMessage, deduplicateMessages, buildTasks } from '../services/analysis.js';
import { parseWaMessages, validateMetaSignature, verifyWebhookChallenge } from '../integrations/whatsapp/webhook.js';
import { validateAIExtraction } from '../services/ai.js';
import crypto from 'node:crypto';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('message normalization', () => {
  it('extracts deadlines and action items', () => {
    const result = analyzeIncomingMessage({
      sender: 'Teammate',
      source: 'generic',
      text: 'Dhruv, please finish the dashboard and push the code before Thursday evening. The review is Friday at 5 PM.',
    });

    expect(result.action_items.length).toBeGreaterThan(0);
    expect(result.deadlines.length).toBeGreaterThan(0);
    expect(result.priority).toBe('high');
    expect(result.conversationId).toBe('demo:Teammate');
  });

  it('deduplicates repeated messages', () => {
    const first = analyzeIncomingMessage({ id: 'abc', sender: 'Lead', source: 'generic', text: 'We decided to use React.' });
    const second = analyzeIncomingMessage({ id: 'abc', sender: 'Lead', source: 'generic', text: 'We decided to use React.' });

    expect(deduplicateMessages([first], second)).toBe(false);
  });

  it('builds task list from messages', () => {
    const tasks = buildTasks([
      analyzeIncomingMessage({ sender: 'Lead', source: 'generic', text: 'Please finish the dashboard by tomorrow.' }),
    ]);

    expect(tasks[0]?.task).toContain('finish');
  });

  it('collapses nested fallback task and deadline matches', () => {
    const result = analyzeIncomingMessage({
      sender: 'Teammate',
      source: 'generic',
      text: 'Dhruv, please finish the dashboard and push the code before Thursday evening. The review is Friday at 5 PM.',
    });

    expect(result.action_items).toHaveLength(1);
    expect(result.deadlines).toHaveLength(2);
    expect(result.deadlines).toContain('before Thursday evening');
    expect(result.deadlines).toContain('Friday at 5 PM');
  });
});

describe('webhook verification', () => {
  it('accepts a valid verification challenge', () => {
    vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'valid-token');
    let statusCode = 0;
    let challenge = '';
    const req = {
      query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'valid-token', 'hub.challenge': 'abc123' },
    } as any;
    const res = {
      status: (code: number) => {
        statusCode = code;
        return { send: (value: string) => { challenge = value; } };
      },
      sendStatus: (code: number) => { statusCode = code; },
    } as any;

    const result = verifyWebhookChallenge(req, res);
    expect(result).toBeUndefined();
    expect(statusCode).toBe(200);
    expect(challenge).toBe('abc123');
  });

  it('rejects webhook verification when no token is configured', () => {
    vi.stubEnv('WHATSAPP_VERIFY_TOKEN', '');
    let statusCode = 0;
    const req = {
      query: { 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': 'abc123' },
    } as any;
    const res = {
      status: () => ({ send: () => undefined }),
      sendStatus: (code: number) => { statusCode = code; },
    } as any;

    verifyWebhookChallenge(req, res);
    expect(statusCode).toBe(403);
  });

  it('validates Meta signatures using the exact raw body', () => {
    const secret = 'test-meta-secret';
    const body = Buffer.from('{"object":"whatsapp_business_account"}');
    vi.stubEnv('META_APP_SECRET', secret);
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

    expect(validateMetaSignature(body, signature)).toBe(true);
    expect(validateMetaSignature(body, 'sha256=bad')).toBe(false);
    expect(validateMetaSignature(body)).toBe(false);
  });

  it('parses every text message in a webhook event and skips unsupported messages', () => {
    const parsed = parseWaMessages({
      entry: [{ changes: [{ value: { messages: [
        { id: 'one', from: '111', timestamp: '100', text: { body: 'first' } },
        { id: 'image', from: '111', timestamp: '101', image: { id: 'media' } },
        { id: 'two', from: '222', timestamp: '102', text: { body: 'second' } },
      ] } }] }],
    });

    expect(parsed.map((message) => message.id)).toEqual(['one', 'two']);
    expect(parsed[0]?.timestamp).toBe(100_000);
    expect(parsed[0]?.conversationId).toBe('111');
  });
});

describe('Gemini response validation', () => {
  it('accepts structured extraction with supported values', () => {
    expect(validateAIExtraction({
      priority: 'high',
      category: 'Task',
      summary: 'Finish the dashboard before Thursday.',
      isTask: true,
      taskTitle: 'Finish the dashboard',
      taskDue: 'Thursday evening',
      isDeadline: true,
      deadlineWhen: 'Thursday evening',
    })).not.toBeNull();
  });

  it('rejects malformed or unsupported extraction values', () => {
    expect(validateAIExtraction({
      priority: 'urgent',
      category: 'Task',
      summary: 'A task.',
      isTask: true,
      taskTitle: 'Do work',
      taskDue: '',
      isDeadline: false,
      deadlineWhen: '',
    })).toBeNull();
  });
});
