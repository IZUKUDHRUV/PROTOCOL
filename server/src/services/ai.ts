import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { DeadlineRecord, NormalizedMessage, TaskRecord } from './analysis.js';

const extractionSchema = z.object({
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  category: z.enum(['Task', 'Deadline', 'Decision', 'General']),
  summary: z.string().min(1).max(500),
  isTask: z.boolean(),
  taskTitle: z.string().max(300),
  taskDue: z.string().max(200),
  isDeadline: z.boolean(),
  deadlineWhen: z.string().max(200),
});

export type AIExtraction = z.infer<typeof extractionSchema>;

export function validateAIExtraction(value: unknown): AIExtraction | null {
  const result = extractionSchema.safeParse(value);
  return result.success ? result.data : null;
}

export async function analyzeWithGemini(message: NormalizedMessage): Promise<NormalizedMessage | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || process.env.GEMINI_CLOUD_ANALYSIS_CONSENT !== 'true') {
    return null;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Analyze this single conversation message and return JSON matching the requested schema.
Do not invent facts. Mark a task only when an action is explicitly requested or committed to.
Mark a deadline only when the message explicitly states a date or time. Keep taskDue/deadlineWhen empty if not explicit.
Message author: ${message.sender}
Source: ${message.source}
Message: ${message.text}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text ?? '');
    const extraction = validateAIExtraction(parsed);
    if (!extraction) return null;

    const task = extraction.isTask && extraction.taskTitle.trim() ? [extraction.taskTitle.trim()] : [];
    const deadline = extraction.isDeadline && extraction.deadlineWhen.trim() ? [extraction.deadlineWhen.trim()] : [];
    return {
      ...message,
      summary: extraction.summary,
      category: extraction.category.toLowerCase(),
      priority: extraction.priority,
      reason: extraction.summary,
      action_items: task.length ? task : message.action_items,
      deadlines: deadline.length ? deadline : message.deadlines,
      confidence: Math.max(message.confidence, 0.75),
    };
  } catch (error) {
    console.error('Gemini analysis failed; using local analysis fallback.');
    return null;
  }
}

export async function askQuestion(
  question: string,
  context: NormalizedMessage[],
  tasks: TaskRecord[] = [],
  deadlines: DeadlineRecord[] = [],
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || process.env.GEMINI_CLOUD_ANALYSIS_CONSENT !== 'true') {
    return `Cloud AI is disabled. Recent message context: ${context
      .slice(0, 3)
      .map((message) => message.summary)
      .join(' | ') || 'No messages available.'}`;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const boundedContext = JSON.stringify({
      messages: context.slice(0, 25).map(({ sender, text, summary, timestamp }) => ({ sender, text, summary, timestamp })),
      tasks: tasks.slice(0, 100),
      deadlines: deadlines.slice(0, 100),
    });
    const prompt = `Use only the supplied context. Do not invent facts. Answer in 1-2 helpful sentences.\n\nQuestion: ${question}\n\nContext JSON:\n${boundedContext}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text ?? 'No answer generated.';
  } catch (error) {
    console.error('Gemini question failed.');
    return 'The AI assistant is not available right now. Please review the latest message feed.';
  }
}
