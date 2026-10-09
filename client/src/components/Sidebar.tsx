import {
  Activity,
  CheckSquare2,
  Inbox,
  LayoutDashboard,
  MessageCircle,
  Settings2,
  type LucideIcon,
} from 'lucide-react';

type Page = 'overview' | 'conversations' | 'actions' | 'integrations' | 'settings';

const navigation: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'conversations', label: 'Conversations', icon: MessageCircle },
  { id: 'actions', label: 'Action items', icon: CheckSquare2 },
  { id: 'integrations', label: 'Integrations', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

export type { Page };

export function Sidebar({ activePage, onNavigate, unreadTotal }: {
  activePage: Page;
  onNavigate: (page: Page) => void;
  unreadTotal: number;
}) {
  return (
    <aside className="sidebar-shell">
      <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); onNavigate('overview'); }}>
        <span className="brand-icon"><Inbox size={19} strokeWidth={2.2} /></span>
        <span className="brand-name">catchup<span>.</span></span>
      </a>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`nav-item ${activePage === id ? 'active' : ''}`} onClick={() => onNavigate(id)}>
            <Icon size={18} strokeWidth={1.9} />
            <span>{label}</span>
            {id === 'conversations' && unreadTotal > 0 && <span className="nav-count">{unreadTotal}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy-card">
          <span className="privacy-dot" />
          <div><strong>Private by default</strong><span>Sample data stays in this browser.</span></div>
        </div>
        <div className="profile-row">
          <div className="profile-avatar">JD</div>
          <div className="profile-copy"><strong>Jamie Davis</strong><span>Personal workspace</span></div>
          <button className="icon-button profile-menu" aria-label="Open settings" onClick={() => onNavigate('settings')}><Settings2 size={17} /></button>
        </div>
      </div>
    </aside>
  );
}
