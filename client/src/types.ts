export type Priority = 'urgent' | 'important' | 'fyi';
export type ProviderId = 'whatsapp' | 'telegram' | 'slack' | 'email';
export type ConnectionStatus = 'connected' | 'configured' | 'needs-setup' | 'scaffold-only' | 'demo';

export type CatchUpMessage = {
  id: string;
  sender: string;
  timestamp: string;
  text: string;
  mention?: boolean;
  priority?: Priority;
};

export type Conversation = {
  id: string;
  conversationId?: string;
  source: ProviderId | 'android' | 'generic';
  sourceLabel: string;
  conversationName: string;
  initials: string;
  color: string;
  unreadCount: number;
  lastActivity: string;
  summaryStatus: 'Ready' | 'Needs review';
  summaryGeneratedAt: string;
  summary: string;
  importantUpdates: string[];
  decisions: string[];
  mentions: string[];
  actionItems: { id: string; title: string; due: string; done: boolean; priority: Priority }[];
  deadlines: { id: string; title: string; when: string; priority: Priority }[];
  messages: CatchUpMessage[];
  demo: boolean;
  origin?: 'sample' | 'imported' | 'synced';
};

export type Provider = {
  id: ProviderId;
  name: string;
  status: ConnectionStatus;
  method: string;
  description: string;
  permissions: string;
  action: string;
};
