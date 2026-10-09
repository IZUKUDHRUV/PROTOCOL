export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type Source = 'whatsapp' | 'android' | 'telegram' | 'generic';

export type NormalizedMessage = {
  id: string;
  conversationId: string;
  source: Source;
  sender: string;
  text: string;
  timestamp: number;
  summary: string;
  category: string;
  priority: Priority;
  reason: string;
  action_items: string[];
  deadlines: string[];
  mentions: string[];
  mentionMetadata?: { target: string; context?: string }[];
  confidence: number;
};

export type TaskRecord = {
  id: string;
  messageId: string;
  title: string;
  detail: string;
  due: string;
  done: boolean;
  source: Source;
  priority: Priority;
};

export type DeadlineRecord = {
  id: string;
  messageId: string;
  title: string;
  when: string;
  detail: string;
  source: Source;
  priority: Priority;
};

export function normalizeMessage(input: Partial<NormalizedMessage> & { id?: string; text?: string; sender?: string; source?: Source; timestamp?: number }): NormalizedMessage {
  const text = input.text?.trim() ?? 'No message content';
  const result = analyzeIncomingMessage({
    id: input.id ?? cryptoRandom(),
    source: input.source ?? 'generic',
    sender: input.sender ?? 'Unknown',
    conversationId: input.conversationId,
    text,
    timestamp: input.timestamp ?? Date.now(),
  });

  return result;
}

export function analyzeIncomingMessage(input: {
  id?: string;
  source?: Source;
  sender?: string;
  conversationId?: string;
  text: string;
  timestamp?: number;
}): NormalizedMessage {
  const text = input.text.trim();
  const sender = input.sender ?? 'Unknown';
  const source = input.source ?? 'generic';
  const timestamp = input.timestamp ?? Date.now();
  const deadlines = extractDeadlines(text);
  const actionItems = extractActions(text);
  const mentions = extractMentions(text);
  const category = determineCategory(text, actionItems.length, deadlines.length);
  const priority = determinePriority(text, actionItems, deadlines, mentions);
  const summary = buildSummaryText(sender, text, category, actionItems, deadlines);
  const reason = buildReason(text, category, priority);
  const confidence = Math.min(0.98, 0.58 + (actionItems.length + deadlines.length) * 0.12 + (mentions.length ? 0.1 : 0));

  return {
    id: input.id ?? cryptoRandom(),
    conversationId: input.conversationId ?? `${source}:${sender}`,
    source,
    sender,
    text,
    timestamp,
    summary,
    category,
    priority,
    reason,
    action_items: actionItems,
    deadlines,
    mentions,
    confidence,
  };
}

export function buildSummaryCards(messages: NormalizedMessage[]) {
  const criticalCount = messages.filter((m) => m.priority === 'critical').length;
  const taskCount = messages.reduce((total, m) => total + Math.max(m.action_items.length, 0), 0);
  const deadlineCount = messages.reduce((total, m) => total + m.deadlines.length, 0);
  const sources = new Set(messages.map((m) => m.source));

  return [
    { label: 'Critical alerts', value: String(criticalCount), description: 'Urgent items that need attention.' },
    { label: 'Open tasks', value: String(taskCount), description: 'Actions assigned or requested.' },
    { label: 'Upcoming deadlines', value: String(deadlineCount), description: 'Time-sensitive items on the radar.' },
    { label: 'Live sources', value: sources.size ? Array.from(sources).join(', ') : '0', description: sources.size ? 'Sources with incoming messages.' : 'No sources have delivered messages yet.' },
  ];
}

export function buildTasks(messages: NormalizedMessage[]) {
  return messages.flatMap((message) =>
    message.action_items.map((task) => ({
      id: `${message.id}-${task}`,
      source: message.source,
      task,
      priority: message.priority,
      sender: message.sender,
    })),
  );
}

export function deduplicateMessages(messages: NormalizedMessage[], next: NormalizedMessage) {
  return !messages.some((message) => message.id === next.id);
}

function determineCategory(text: string, actionCount: number, deadlineCount: number) {
  if (/decision|decided|agreed|approved|use React|use Gemini|finalized/.test(text)) return 'decision';
  if (deadlineCount > 0) return 'deadline';
  if (actionCount > 0) return 'task';
  if (/coffee|lunch|hello|hey|good morning|thanks|how are you/i.test(text)) return 'low-priority';
  return 'announcement';
}

function determinePriority(text: string, actionItems: string[], deadlines: string[], mentions: string[]) {
  const lower = text.toLowerCase();
  if (/urgent|asap|critical|blocked|emergency|immediately/.test(lower)) return 'critical';
  if (actionItems.length > 0 || deadlines.length > 0 || mentions.some((mention) => /dhruv|you|your/.test(mention.toLowerCase())) || /before .*evening|before .*pm|before .*am/.test(lower)) return 'high';
  if (/decision|approved|scheduled|review|launch|deadline/.test(lower)) return 'medium';
  return 'low';
}

function extractDeadlines(text: string) {
  const deadlines: string[] = [];
  const patterns = [
    /(?:final|project|submission|review|demo|launch|meeting|deadline).*?(?:on|for|by)?\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|tomorrow|today)(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:AM|PM))?/gi,
    /(\w+\s+at\s+\d{1,2}(?::\d{2})?\s*(?:AM|PM))/gi,
    /(before\s+\w+\s+evening)/gi,
  ];

  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      const value = match[0]?.trim();
      if (value && !deadlines.includes(value)) deadlines.push(value);
    }
  }

  return deadlines.filter((candidate, index) =>
    !deadlines.some((other, otherIndex) =>
      otherIndex !== index &&
      candidate.length > other.length &&
      candidate.toLowerCase().includes(other.toLowerCase()),
    ),
  );
}

function extractActions(text: string) {
  const tasks: string[] = [];
  const actionPatterns = [
    /(?:please|need to|must|should|can you|could you)\s+([^.!?]+)/gi,
    /finish\s+([^.!?]+)/gi,
    /push\s+the\s+code/gi,
  ];

  for (const pattern of actionPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const value = match[1]?.trim() ?? match[0]?.trim();
      if (value) tasks.push(value.replace(/\s+/g, ' '));
    }
  }

  const uniqueTasks = [...new Set(tasks)];
  return uniqueTasks
    .filter((candidate, index) =>
      !uniqueTasks.some((other, otherIndex) =>
        otherIndex !== index &&
        other.length > candidate.length &&
        other.toLowerCase().includes(candidate.toLowerCase()),
      ),
    )
    .slice(0, 3);
}

function extractMentions(text: string) {
  const mentions = [...text.matchAll(/(?:@)?([A-Z][a-z]+|Dhruv|you|your)/g)]
    .map((match) => match[1])
    .filter(Boolean);

  return [...new Set(mentions)];
}

function buildSummaryText(sender: string, text: string, category: string, actionItems: string[], deadlines: string[]) {
  const actions = actionItems.length ? `Action: ${actionItems[0]}.` : '';
  const due = deadlines.length ? `Deadline: ${deadlines[0]}.` : '';
  return `${sender} shared ${category} information. ${actions} ${due} Message: ${text.slice(0, 120)}${text.length > 120 ? '…' : ''}`.trim();
}

function buildReason(text: string, category: string, priority: Priority) {
  if (priority === 'critical') return 'The message contains urgent timing or action language that likely needs immediate attention.';
  if (category === 'decision') return 'This message records an explicit decision, choice, or direction for the team.';
  if (category === 'deadline') return 'This message includes a recognizable time-sensitive commitment.';
  if (category === 'task') return 'This message includes a task or requested work item.';
  return 'This appears to be low-priority conversation and does not require urgent action.';
}

function cryptoRandom() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
