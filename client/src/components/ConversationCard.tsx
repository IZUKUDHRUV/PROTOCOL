import { ArrowUpRight, Check, Circle, MessageSquareText } from 'lucide-react';
import type { Conversation } from '../types';

const sourceClass: Record<string, string> = {
  whatsapp: 'source-whatsapp',
  telegram: 'source-telegram',
  slack: 'source-slack',
  email: 'source-email',
};

export function ConversationCard({ conversation, selected, onSelect, onCatchUp }: {
  conversation: Conversation;
  selected: boolean;
  onSelect: () => void;
  onCatchUp: () => void;
}) {
  const isCaughtUp = conversation.unreadCount === 0;

  return (
    <article className={`conversation-card ${selected ? 'selected' : ''}`}>
      <button className="conversation-main" onClick={onSelect} aria-label={`Open ${conversation.conversationName}`}>
        <span className={`conversation-avatar avatar-${conversation.color}`}>{conversation.initials}</span>
        <span className="conversation-copy">
          <span className="conversation-heading">
            <strong>{conversation.conversationName}</strong>
            {conversation.unreadCount > 0 && <span className="unread-count">{conversation.unreadCount}</span>}
          </span>
          <span className="conversation-meta">
            <span className={`source-label ${sourceClass[conversation.source]}`}><Circle size={7} fill="currentColor" />{conversation.sourceLabel}</span>
            <span className="meta-separator">·</span>
            <span>{conversation.lastActivity}</span>
          </span>
          <span className="conversation-summary">{conversation.summary}</span>
          <span className="conversation-tags">
            {conversation.mentions.length > 0 && <span className="mini-tag mention-tag"><MessageSquareText size={11} /> Mentioned you</span>}
            {conversation.actionItems.some((item) => !item.done) && <span className="mini-tag task-tag">{conversation.actionItems.filter((item) => !item.done).length} action{conversation.actionItems.filter((item) => !item.done).length === 1 ? '' : 's'}</span>}
            {conversation.summaryStatus === 'Needs review' && <span className="mini-tag review-tag">Review summary</span>}
          </span>
        </span>
        <ArrowUpRight className="conversation-arrow" size={17} />
      </button>
      {!isCaughtUp && (
        <button className="caught-up-button" onClick={onCatchUp} aria-label={`Mark ${conversation.conversationName} as caught up`}>
          <Check size={14} /> Mark caught up
        </button>
      )}
    </article>
  );
}
