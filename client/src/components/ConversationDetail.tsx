import { useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Clock3, MessageSquareText, Sparkles, Trash2 } from 'lucide-react';
import type { Conversation } from '../types';

const priorityText = { urgent: 'Urgent', important: 'Important', fyi: 'FYI' } as const;

export function ConversationDetail({
  conversation,
  onToggleTask,
  onDelete,
}: {
  conversation: Conversation | null;
  onToggleTask: (conversationId: string, taskId: string) => void;
  onDelete: (conversationId: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!conversation) {
    return (
      <section className="detail-empty">
        <div className="empty-mark">
          <MessageSquareText size={24} />
        </div>
        <h2>Select a conversation</h2>
        <p>Choose a thread to see its catch-up summary, mentions, tasks, and deadlines.</p>
      </section>
    );
  }

  return (
    <section className="detail-panel" aria-label={`${conversation.conversationName} details`}>
      <header className="detail-header">
        <div className={`conversation-avatar avatar-${conversation.color}`}>{conversation.initials}</div>
        <div className="detail-title">
          <div>
            <h2>{conversation.conversationName}</h2>
            {conversation.demo && <span className="demo-chip">SAMPLE</span>}
            {conversation.origin === 'imported' && <span className="demo-chip">IMPORTED</span>}
          </div>
          <p>
            {conversation.sourceLabel} <span>·</span> Last activity {conversation.lastActivity}
          </p>
        </div>
        <button
          className="icon-button delete-thread"
          aria-label="Delete conversation data"
          title="Delete conversation data"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 size={16} />
        </button>
      </header>

      {conversation.demo && (
        <div className="sample-notice">
          <span className="sample-dot" /> Example conversation · not synced from an account
        </div>
      )}
      {conversation.origin === 'imported' && (
        <div className="sample-notice">
          <span className="sample-dot" /> Local text export · file was not uploaded
        </div>
      )}

      <div className="detail-scroll">
        <section className="detail-section summary-section">
          <div className="section-heading">
            <span className="section-icon summary-icon">
              <Sparkles size={15} />
            </span>
            <h3>Short summary</h3>
            <span className="summary-time">Generated {conversation.summaryGeneratedAt}</span>
          </div>
          <p className="summary-large">{conversation.summary}</p>
          <span className={`summary-status ${conversation.summaryStatus === 'Ready' ? 'ready' : 'review'}`}>
            {conversation.summaryStatus === 'Ready' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            {conversation.summaryStatus === 'Ready' ? 'Summary ready' : 'Worth a quick review'}
          </span>
        </section>

        <section className="detail-section">
          <div className="section-heading">
            <span className="section-icon update-icon">
              <MessageSquareText size={15} />
            </span>
            <h3>Important updates & decisions</h3>
          </div>
          {conversation.importantUpdates.length || conversation.decisions.length ? (
            <ul className="update-list">
              {conversation.importantUpdates.map((update) => (
                <li key={update}>
                  <span className="priority-indicator important" />
                  {update}
                  <span className="priority-label">Important</span>
                </li>
              ))}
              {conversation.decisions.map((decision) => (
                <li key={decision}>
                  <span className="priority-indicator fyi" />
                  {decision}
                  <span className="priority-label">Decision</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="quiet-empty">No important updates found in this conversation.</p>
          )}
        </section>

        <section className="detail-section">
          <div className="section-heading">
            <span className="section-icon mention-icon">
              <MessageSquareText size={15} />
            </span>
            <h3>Mentions of me</h3>
            <span className="section-count">{conversation.mentions.length}</span>
          </div>
          {conversation.mentions.length ? (
            conversation.mentions.map((mention) => (
              <div className="mention-row" key={mention}>
                <span className="mention-avatar">@</span>
                <p>{mention}</p>
              </div>
            ))
          ) : (
            <p className="quiet-empty">No direct mentions in this thread.</p>
          )}
        </section>

        <section className="detail-section">
          <div className="section-heading">
            <span className="section-icon task-icon">
              <Check size={15} />
            </span>
            <h3>Action items assigned to me</h3>
            <span className="section-count">{conversation.actionItems.length}</span>
          </div>
          {conversation.actionItems.length ? (
            <div className="action-list">
              {conversation.actionItems.map((item) => (
                <label className={`action-row ${item.done ? 'is-done' : ''}`} key={item.id}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => onToggleTask(conversation.id, item.id)}
                  />
                  <span className="action-copy">
                    <strong>{item.title}</strong>
                    <small>
                      <Clock3 size={12} />
                      {item.due}
                    </small>
                  </span>
                  <span className={`priority-pill ${item.priority}`}>{priorityText[item.priority]}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="quiet-empty">No action items assigned to you.</p>
          )}
        </section>

        <section className="detail-section last-section">
          <div className="section-heading">
            <span className="section-icon deadline-icon">
              <Clock3 size={15} />
            </span>
            <h3>Deadlines & urgent messages</h3>
          </div>
          {conversation.deadlines.length ? (
            <div className="deadline-list">
              {conversation.deadlines.map((deadline) => (
                <div className="deadline-row" key={deadline.id}>
                  <span className={`priority-indicator ${deadline.priority}`} />
                  <div>
                    <strong>{deadline.title}</strong>
                    <small>{deadline.when}</small>
                  </div>
                  <span className={`priority-pill ${deadline.priority}`}>{priorityText[deadline.priority]}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="quiet-empty">No deadlines or urgent messages found.</p>
          )}
        </section>

        <section className="original-messages">
          <details>
            <summary>
              View recent messages <span>{conversation.messages.length}</span>
            </summary>
            <div className="message-list">
              {conversation.messages.map((message) => (
                <article className="message-row" key={message.id}>
                  <div className="message-meta">
                    <strong>{message.sender}</strong>
                    <time>{message.timestamp}</time>
                  </div>
                  <p>{message.text}</p>
                  {message.mention && <span className="message-tag">Mention</span>}
                </article>
              ))}
            </div>
          </details>
        </section>
      </div>

      {confirmDelete && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmDelete(false);
          }}
        >
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-heading">
            <div className="modal-icon">
              <Trash2 size={19} />
            </div>
            <h3 id="delete-heading">Delete this conversation?</h3>
            <p>This removes this conversation and its sample or imported content from the current app state.</p>
            <div className="modal-actions">
              <button className="button-quiet" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                className="button-danger"
                onClick={() => {
                  onDelete(conversation.id);
                  setConfirmDelete(false);
                }}
              >
                Delete conversation
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
