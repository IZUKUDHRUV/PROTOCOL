import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  Filter,
  Inbox,
  Menu,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { ConversationCard } from './components/ConversationCard';
import { ConversationDetail } from './components/ConversationDetail';
import { IntegrationsView } from './components/IntegrationsView';
import { SettingsView } from './components/SettingsView';
import { Sidebar, type Page } from './components/Sidebar';
import { demoConversations, demoProviders } from './data/demoConversations';
import { parseWhatsAppExport } from './services/importWhatsAppChat';
import type { Conversation, Priority, Provider, ProviderId } from './types';
import './index.css';

const providerNames: Record<ProviderId, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  slack: 'Slack',
  email: 'Email',
};

const severityRank: Record<Priority, number> = { urgent: 0, important: 1, fyi: 2 };

type SourceFilter = 'all' | ProviderId | 'android' | 'generic';

function cloneSamples(): Conversation[] {
  return demoConversations.map((conversation) => ({
    ...conversation,
    importantUpdates: [...conversation.importantUpdates],
    decisions: [...conversation.decisions],
    mentions: [...conversation.mentions],
    actionItems: conversation.actionItems.map((item) => ({ ...item })),
    deadlines: conversation.deadlines.map((item) => ({ ...item })),
    messages: conversation.messages.map((item) => ({ ...item })),
  }));
}

function mapPriority(priority: string): Priority {
  if (priority === 'critical') return 'urgent';
  if (priority === 'high' || priority === 'medium') return 'important';
  return 'fyi';
}

function providerStatusFromApi(status: string): Provider['status'] {
  if (status === 'receiving') return 'connected';
  if (status === 'awaiting webhook' || status === 'awaiting device') return 'configured';
  if (status === 'scaffold-only') return 'scaffold-only';
  return 'needs-setup';
}

function sourceLabel(source: string): string {
  if (source === 'android') return 'Android notifications';
  if (source === 'generic') return 'Other source';
  return providerNames[source as ProviderId] ?? 'Other source';
}

function toLiveConversations(messages: Array<Record<string, unknown>>): Conversation[] {
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const message of messages) {
    const source = String(message.source ?? 'generic');
    const conversationId = String(message.conversationId ?? message.sender ?? source);
    const key = `${source}:${conversationId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), message]);
  }

  return Array.from(grouped, ([key, entries]) => {
    const newest = entries[0] ?? {};
    const source = String(newest.source ?? 'generic');
    const conversationId = String(newest.conversationId ?? newest.sender ?? source);
    const provider = source === 'whatsapp' || source === 'telegram' || source === 'slack' || source === 'email'
      ? source as ProviderId
      : source === 'android' || source === 'generic' ? source : 'generic';
    const label = sourceLabel(source);
    const summary = typeof newest.summary === 'string' ? newest.summary : 'A new message arrived. Review the original message for details.';
    const actionItems = entries.flatMap((entry) => Array.isArray(entry.action_items)
      ? (entry.action_items as string[]).map((title, index) => ({
        id: `${String(entry.id)}-task-${index}`,
        title,
        due: Array.isArray(entry.deadlines) ? String(entry.deadlines[0] ?? 'Not specified') : 'Not specified',
        done: false,
        priority: mapPriority(String(entry.priority ?? 'low')),
      }))
      : []);
    const deadlines = entries.flatMap((entry) => Array.isArray(entry.deadlines)
      ? (entry.deadlines as string[]).map((when, index) => ({
        id: `${String(entry.id)}-deadline-${index}`,
        title: String(entry.summary ?? 'Time-sensitive message'),
        when,
        priority: mapPriority(String(entry.priority ?? 'low')),
      }))
      : []);

    return {
      id: `live-${key}`,
      conversationId,
      source: provider,
      sourceLabel: label,
      conversationName: String(newest.conversationName ?? newest.sender ?? `${label} conversation`),
      initials: String(newest.sender ?? label).slice(0, 2).toUpperCase(),
      color: provider === 'whatsapp' ? 'green' : provider === 'telegram' ? 'blue' : provider === 'slack' ? 'violet' : 'mint',
      unreadCount: entries.length,
      lastActivity: 'Just synced',
      summaryStatus: 'Ready',
      summaryGeneratedAt: 'Just now',
      summary,
      importantUpdates: entries.filter((entry) => ['high', 'critical', 'medium'].includes(String(entry.priority))).map((entry) => String(entry.summary ?? entry.text ?? 'Important update')),
      decisions: entries.filter((entry) => String(entry.category).toLowerCase() === 'decision').map((entry) => String(entry.summary ?? entry.text ?? 'Decision recorded')),
      mentions: entries.flatMap((entry) => Array.isArray(entry.mentions) ? (entry.mentions as string[]) : []),
      actionItems,
      deadlines,
      messages: entries.map((entry, index) => ({
        id: String(entry.id ?? `${source}-${index}`),
        sender: String(entry.sender ?? 'Unknown sender'),
        timestamp: new Date(Number(entry.timestamp ?? Date.now())).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: String(entry.text ?? ''),
        priority: mapPriority(String(entry.priority ?? 'low')),
      })),
      demo: false,
      origin: 'synced',
    };
  });
}

export default function App() {
  const [activePage, setActivePage] = useState<Page>('overview');
  const [conversations, setConversations] = useState<Conversation[]>(cloneSamples);
  const [providers, setProviders] = useState<Provider[]>(demoProviders);
  const [selectedId, setSelectedId] = useState<string | null>(demoConversations[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const [setupProvider, setSetupProvider] = useState<Provider | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const unreadTotal = useMemo(() => conversations.reduce((total, conversation) => total + conversation.unreadCount, 0), [conversations]);
  const unreadConversations = useMemo(() => conversations.filter((conversation) => conversation.unreadCount > 0), [conversations]);
  const pendingTasks = useMemo(() => conversations.flatMap((conversation) => conversation.actionItems
    .filter((item) => !item.done)
    .map((item) => ({ ...item, conversationId: conversation.id, conversationName: conversation.conversationName, source: conversation.sourceLabel }))), [conversations]);
  const urgentCount = useMemo(() => conversations.reduce((total, conversation) => total + conversation.deadlines.filter((item) => item.priority === 'urgent').length, 0), [conversations]);

  const visibleConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations
      .filter((conversation) => !onlyUnread || conversation.unreadCount > 0)
      .filter((conversation) => sourceFilter === 'all' || conversation.source === sourceFilter)
      .filter((conversation) => !query || [conversation.conversationName, conversation.sourceLabel, conversation.summary, ...conversation.messages.map((message) => message.text)].join(' ').toLowerCase().includes(query));
  }, [conversations, onlyUnread, search, sourceFilter]);

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId) ?? visibleConversations[0] ?? null;

  const applyLiveState = useCallback((messages: Array<Record<string, unknown>>) => {
    const liveConversations = toLiveConversations(messages);
    if (!liveConversations.length) return;

    setConversations((current) => {
      const liveIds = new Set(liveConversations.map((conversation) => conversation.id));
      const liveSources = new Set(liveConversations.map((conversation) => conversation.source));
      return [
        ...current.filter((conversation) => !liveIds.has(conversation.id) && (!liveSources.has(conversation.source) || conversation.origin === 'synced' || conversation.origin === 'imported')),
        ...liveConversations,
      ];
    });
  }, []);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshMessage('');
    try {
      const [stateResponse, integrationResponse] = await Promise.all([fetch('/api/state'), fetch('/api/integrations')]);
      if (!stateResponse.ok || !integrationResponse.ok) throw new Error('Could not reach the app server. Local sample conversations are still available.');
      const [stateData, integrationData] = await Promise.all([stateResponse.json(), integrationResponse.json()]);
      if (Array.isArray(stateData.messages)) applyLiveState(stateData.messages);
      setProviders((current) => current.map((provider) => {
        const remote = integrationData[provider.id];
        if (!remote) return provider;
        const description = provider.id === 'whatsapp' && remote.personalInboxSupported === false
          ? 'Business Platform webhook only. Personal WhatsApp inboxes are not available through this integration.'
          : provider.description;
        return { ...provider, status: providerStatusFromApi(String(remote.status)), description };
      }));
      setRefreshMessage('Sources refreshed');
    } catch (error) {
      setRefreshMessage(error instanceof Error ? error.message : 'Refresh failed. Local samples are still available.');
    } finally {
      setIsRefreshing(false);
    }
  }, [applyLiveState]);

  useEffect(() => {
    void refreshData();
    const eventSource = new EventSource('/api/events');
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string; message?: Record<string, unknown>; conversationId?: string };
        if (payload.type === 'message' && payload.message) applyLiveState([payload.message]);
        if (payload.type === 'conversation-deleted' && payload.conversationId) {
          setConversations((current) => current.filter((conversation) => conversation.conversationId !== payload.conversationId));
        }
        if (payload.type === 'clear') setConversations((current) => current.filter((conversation) => conversation.origin !== 'synced'));
      } catch {
        setRefreshMessage('A live update could not be read. Refresh to try again.');
      }
    };
    return () => eventSource.close();
  }, [applyLiveState, refreshData]);

  const markCaughtUp = (id: string) => setConversations((current) => current.map((conversation) => conversation.id === id ? { ...conversation, unreadCount: 0 } : conversation));
  const markAllCaughtUp = () => setConversations((current) => current.map((conversation) => ({ ...conversation, unreadCount: 0 })));

  const deleteConversation = (id: string) => {
    const conversation = conversations.find((item) => item.id === id);
    if (conversation?.origin === 'synced' && conversation.conversationId) {
      void fetch(`/api/conversations/${encodeURIComponent(conversation.conversationId)}`, { method: 'DELETE' })
        .catch(() => setRefreshMessage('Could not delete synced conversation from the server.'));
    }
    setConversations((current) => current.filter((item) => item.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const clearAllData = () => {
    setConversations([]);
    setSelectedId(null);
    void fetch('/api/privacy/clear', { method: 'POST' }).catch(() => setRefreshMessage('Could not clear server data.'));
  };

  const toggleAction = (conversationId: string, taskId: string) => setConversations((current) => current.map((conversation) => conversation.id === conversationId
    ? { ...conversation, actionItems: conversation.actionItems.map((item) => item.id === taskId ? { ...item, done: !item.done } : item) }
    : conversation));

  const importWhatsAppFile = async (file: File) => {
    try {
      const messages = await parseWhatsAppExport(file);
      const conversationName = file.name.replace(/\.txt$/i, '').replace(/[_-]+/g, ' ') || 'WhatsApp chat export';
      const imported: Conversation = {
        id: `import-${Date.now()}`,
        source: 'whatsapp',
        sourceLabel: 'WhatsApp export',
        conversationName,
        initials: conversationName.slice(0, 2).toUpperCase(),
        color: 'green',
        unreadCount: messages.length,
        lastActivity: 'Imported just now',
        summaryStatus: 'Needs review',
        summaryGeneratedAt: 'Local import',
        summary: `Imported ${messages.length} messages from a text export. Review the original thread; no AI interpretation has been applied.`,
        importantUpdates: [],
        decisions: [],
        mentions: [],
        actionItems: [],
        deadlines: [],
        messages,
        demo: false,
        origin: 'imported',
      };
      setConversations((current) => [imported, ...current]);
      setSelectedId(imported.id);
      setActivePage('conversations');
      setRefreshMessage('Chat imported locally in this browser only.');
    } catch (error) {
      setRefreshMessage(error instanceof Error ? error.message : 'Could not read this chat export.');
    }
  };

  const navigate = (page: Page) => {
    setActivePage(page);
    setMobileNavOpen(false);
  };

  const pageTitle: Record<Page, string> = {
    overview: 'Your catch-up',
    conversations: 'Conversations',
    actions: 'Action items',
    integrations: 'Integrations',
    settings: 'Privacy & settings',
  };

  return (
    <div className="app-shell">
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileNavOpen(false)} />}
      <div className={`sidebar-wrap ${mobileNavOpen ? 'mobile-open' : ''}`}><Sidebar activePage={activePage} onNavigate={navigate} unreadTotal={unreadTotal} /></div>
      <main className="main-shell">
        <header className="app-topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={19} /></button>
          <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>{pageTitle[activePage]}</strong></div>
          <div className="topbar-actions"><span className="demo-mode-badge"><span />{conversations.some((conversation) => conversation.origin === 'synced') ? 'Sample + live' : 'Local sample data'}</span><button className="icon-button help-button" aria-label="About this app" title="About this app"><CircleHelp size={17} /></button><div className="top-avatar">JD</div></div>
        </header>

        <div className="app-content">
          {activePage === 'overview' && <>
            <section className="welcome-row">
              <div><p className="eyebrow">FRIDAY, OCTOBER 9</p><h1>Your catch-up<span className="heading-period">.</span></h1><p className="welcome-copy">The important parts, without the scroll.</p></div>
              <div className="welcome-actions"><button className="button-secondary" onClick={() => void refreshData()} disabled={isRefreshing}><RefreshCw size={15} className={isRefreshing ? 'spin' : ''} />{isRefreshing ? 'Refreshing' : 'Refresh'}</button><button className="button-primary" onClick={markAllCaughtUp} disabled={!unreadTotal}><Check size={16} /> Mark all caught up</button></div>
            </section>
            <div className="demo-banner"><Sparkles size={15} /><span>Sample workspace</span><span className="banner-divider">·</span><p>These example conversations live in this browser only. Connect a provider to bring in your own.</p><button onClick={() => navigate('integrations')}>Explore integrations <ArrowRight size={13} /></button></div>
            {refreshMessage && <div className={`inline-notice ${/could not|failed|larger|recognized/i.test(refreshMessage) ? 'notice-error' : ''}`} role="status">{refreshMessage}</div>}
            <section className="overview-metrics" aria-label="Catch-up overview">
              <article className="metric-card unread-metric"><div className="metric-top"><span className="metric-label">Unread conversations</span><span className="metric-icon"><Inbox size={17} /></span></div><strong>{unreadConversations.length.toString().padStart(2, '0')}</strong><span className="metric-caption">Across {unreadTotal} unread messages</span></article>
              <article className="metric-card urgent-metric"><div className="metric-top"><span className="metric-label">Urgent items</span><span className="metric-icon"><Clock3 size={17} /></span></div><strong>{urgentCount.toString().padStart(2, '0')}</strong><span className="metric-caption">Need your attention soon</span></article>
              <article className="metric-card task-metric"><div className="metric-top"><span className="metric-label">Pending tasks</span><span className="metric-icon"><Check size={17} /></span></div><strong>{pendingTasks.length.toString().padStart(2, '0')}</strong><span className="metric-caption">Assigned or mentioned to you</span></article>
              <article className="range-card"><div className="range-top"><CalendarDays size={16} /><span>YOUR CATCH-UP</span><ChevronDown size={14} /></div><strong>Since you were away</strong><span>{unreadTotal} unread messages · {unreadConversations.length} conversations</span><div className="range-foot"><span className="range-live" /> Updated just now</div></article>
            </section>
            <section className="overview-layout">
              <div className="conversation-column">
                <div className="section-toolbar"><div><div className="section-kicker">INBOX</div><h2>Conversations <span>{visibleConversations.length}</span></h2></div><button className={`filter-button ${onlyUnread ? 'filter-on' : ''}`} onClick={() => setOnlyUnread((value) => !value)}><Filter size={15} />Unread only{onlyUnread && <Check size={13} />}</button></div>
                <div className="search-tools"><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations or messages" aria-label="Search conversations" /><kbd><Command size={11} /> K</kbd></label><label className="source-select"><ArrowDownUp size={14} /><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)} aria-label="Filter by source"><option value="all">All sources</option><option value="whatsapp">WhatsApp</option><option value="android">Android notifications</option><option value="telegram">Telegram</option><option value="slack">Slack</option><option value="email">Email</option><option value="generic">Other sources</option></select></label></div>
                <div className="conversation-list">{visibleConversations.length ? visibleConversations.map((conversation) => <ConversationCard key={conversation.id} conversation={conversation} selected={conversation.id === selectedConversation?.id} onSelect={() => setSelectedId(conversation.id)} onCatchUp={() => markCaughtUp(conversation.id)} />) : <div className="list-empty"><Inbox size={22} /><strong>No conversations found</strong><span>Try clearing search or source filters.</span><button onClick={() => { setSearch(''); setSourceFilter('all'); setOnlyUnread(false); }}>Clear filters</button></div>}</div>
                <button className="load-more" onClick={() => navigate('conversations')}>View all conversations <ArrowRight size={14} /></button>
              </div>
              <div className="detail-column"><ConversationDetail conversation={selectedConversation} onToggleTask={toggleAction} onDelete={deleteConversation} /></div>
            </section>
          </>}

          {activePage === 'conversations' && <section className="page-content conversation-page"><div className="page-heading-row"><div><p className="eyebrow">YOUR INBOX</p><h1>Conversations</h1><p>Catch up by thread, with context and evidence kept together.</p></div><button className="button-secondary" onClick={() => void refreshData()} disabled={isRefreshing}><RefreshCw size={15} className={isRefreshing ? 'spin' : ''} />Refresh sources</button></div><div className="search-tools page-search"><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations or messages" aria-label="Search conversations" /></label><label className="source-select"><Filter size={14} /><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}><option value="all">All sources</option><option value="whatsapp">WhatsApp</option><option value="android">Android notifications</option><option value="telegram">Telegram</option><option value="slack">Slack</option><option value="email">Email</option><option value="generic">Other sources</option></select></label></div><div className="all-conversations-layout"><div className="conversation-list">{visibleConversations.length ? visibleConversations.map((conversation) => <ConversationCard key={conversation.id} conversation={conversation} selected={conversation.id === selectedConversation?.id} onSelect={() => setSelectedId(conversation.id)} onCatchUp={() => markCaughtUp(conversation.id)} />) : <div className="list-empty"><Inbox size={22} /><strong>Your inbox is clear</strong><span>Connect a source or reset your filters.</span></div>}</div><ConversationDetail conversation={selectedConversation} onToggleTask={toggleAction} onDelete={deleteConversation} /></div></section>}

          {activePage === 'actions' && <section className="page-content actions-page"><div className="page-heading-row"><div><p className="eyebrow">FOLLOW-THROUGH</p><h1>Action items</h1><p>Tasks pulled from messages that need your attention.</p></div><span className="task-total">{pendingTasks.length} open</span></div><div className="action-page-list">{pendingTasks.length ? [...pendingTasks].sort((a, b) => severityRank[a.priority] - severityRank[b.priority]).map((task) => <label className="action-page-row" key={task.id}><input type="checkbox" checked={task.done} onChange={() => toggleAction(task.conversationId, task.id)} /><span className={`priority-indicator ${task.priority}`} /><span className="action-page-copy"><strong>{task.title}</strong><small>{task.conversationName} <span>·</span> {task.source}</small></span><span className="action-due"><Clock3 size={13} />{task.due}</span><span className={`priority-pill ${task.priority}`}>{task.priority}</span></label>) : <div className="list-empty"><Check size={22} /><strong>Nothing on your plate</strong><span>New tasks appear here when a connected conversation mentions you.</span></div>}</div></section>}

          {activePage === 'integrations' && <IntegrationsView providers={providers} onConfigure={setSetupProvider} onImportWhatsApp={importWhatsAppFile} notice={refreshMessage} />}
          {activePage === 'settings' && <SettingsView demoCount={conversations.length} onDeleteData={clearAllData} />}
          <footer className="privacy-footer"><span><span className="footer-lock" />Your messages are private</span><span>Samples are local · Provider data access requires your approval</span><button onClick={() => navigate('settings')}>Privacy settings <ArrowRight size={12} /></button></footer>
        </div>
      </main>

      {setupProvider && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSetupProvider(null); }}><div className="setup-modal" role="dialog" aria-modal="true" aria-labelledby="provider-dialog-title"><button className="icon-button modal-close" onClick={() => setSetupProvider(null)} aria-label="Close"><X size={18} /></button><p className="eyebrow">SOURCE SETUP</p><h2 id="provider-dialog-title">Connect {setupProvider.name}</h2><p className="setup-intro">{setupProvider.description}</p><div className="setup-detail"><strong>Supported method</strong><span>{setupProvider.method}</span></div><div className="setup-detail"><strong>Data & permissions</strong><span>{setupProvider.permissions}</span></div><div className="setup-safety"><span className="safety-check"><Check size={13} /></span><p>Do not enter provider credentials here. Configure tokens in the backend environment; this interface never sends secrets to the browser.</p></div><div className="modal-actions"><button className="button-secondary" onClick={() => setSetupProvider(null)}>Close</button><button className="button-primary" onClick={() => { setSetupProvider(null); setRefreshMessage(`${setupProvider.name} setup instructions are in README.md.`); }}>View setup notes <ArrowRight size={14} /></button></div></div></div>}
    </div>
  );
}
