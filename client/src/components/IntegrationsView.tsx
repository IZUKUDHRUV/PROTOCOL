import { useRef, useState } from 'react';
import { ArrowUpRight, Check, Mail, MessageCircle, MessageSquare, Send, ShieldCheck, Upload, X } from 'lucide-react';
import type { Provider } from '../types';

const icons = {
  whatsapp: MessageCircle,
  telegram: Send,
  slack: MessageSquare,
  email: Mail,
};

const statusLabels = {
  connected: 'Connected',
  configured: 'Configured · awaiting messages',
  'needs-setup': 'Not connected',
  'scaffold-only': 'Setup not implemented',
  demo: 'Demo data',
};

export function IntegrationsView({ providers, onConfigure, onImportWhatsApp, notice }: {
  providers: Provider[];
  onConfigure: (provider: Provider) => void;
  onImportWhatsApp: (file: File) => void;
  notice: string;
}) {
  const importInput = useRef<HTMLInputElement>(null);
  return (
    <div className="page-content integration-page">
      <div className="page-heading-row"><div><p className="eyebrow">YOUR SOURCES</p><h1>Integrations</h1><p>Choose what you connect. Your messages stay in the browser until you enable a real provider.</p></div></div>
      <div className="privacy-banner"><ShieldCheck size={19} /><div><strong>Read the data access before connecting</strong><p>Tokens belong on the backend only. Cloud AI processing is off unless you configure it and provide consent.</p></div></div>
      {notice && <div className={`inline-notice ${notice.includes('Could not') || notice.includes('larger') || notice.includes('recognized') ? 'notice-error' : ''}`} role="status">{notice}</div>}
      <div className="integration-grid">{providers.map((provider) => {
        const Icon = icons[provider.id];
        return <article className="integration-card" key={provider.id}>
          <div className="integration-top"><span className={`provider-icon provider-${provider.id}`}><Icon size={21} /></span><span className={`connection-badge ${provider.status}`}>{provider.status === 'connected' && <Check size={12} />}{statusLabels[provider.status]}</span></div>
          <h2>{provider.name}</h2><p className="integration-method">{provider.method}</p><p className="integration-description">{provider.description}</p>
          <div className="permission-note"><strong>What access is needed</strong><p>{provider.permissions}</p></div>
          <button className="integration-action" onClick={() => onConfigure(provider)}>{provider.action}<ArrowUpRight size={15} /></button>
          {provider.id === 'whatsapp' && <>
            <input ref={importInput} className="visually-hidden" type="file" accept=".txt,text/plain" aria-label="Choose WhatsApp chat export" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportWhatsApp(file); event.currentTarget.value = ''; }} />
            <button className="import-chat-action" onClick={() => importInput.current?.click()}><Upload size={13} />Import a WhatsApp chat export</button>
            <p className="import-caption">Personal inbox alternative · parsed locally · .txt exports up to 1 MB</p>
          </>}
        </article>;
      })}</div>
      <p className="integration-footnote"><X size={13} /> Personal WhatsApp inbox access is not supported. WhatsApp connects only through Meta’s authorized Business Platform or a separately configured notification bridge.</p>
    </div>
  );
}
