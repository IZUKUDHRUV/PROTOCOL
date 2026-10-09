import { useState } from 'react';
import { Database, LockKeyhole, Trash2 } from 'lucide-react';

export function SettingsView({ demoCount, onDeleteData }: { demoCount: number; onDeleteData: () => void }) {
  const [cloudConsent, setCloudConsent] = useState(false);
  return (
    <div className="page-content settings-page">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">PREFERENCES</p>
          <h1>Privacy & settings</h1>
          <p>Choose how summaries are generated and manage conversation data.</p>
        </div>
      </div>
      <section className="settings-section">
        <div className="settings-icon">
          <LockKeyhole size={19} />
        </div>
        <div className="settings-copy">
          <h2>AI processing</h2>
          <p>
            Local summaries are available in demo mode. Cloud AI is not currently configured in this browser. Enabling
            consent here records your preference; a server API key and server-side consent gate are also required.
          </p>
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={cloudConsent}
              onChange={(event) => setCloudConsent(event.target.checked)}
            />
            <span>Allow conversation text to be sent to a configured AI provider</span>
          </label>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-icon">
          <Database size={19} />
        </div>
        <div className="settings-copy">
          <h2>Conversation data</h2>
          <p>
            {demoCount} conversation{demoCount === 1 ? '' : 's'} currently available in this workspace. Sample content
            and imported chat exports stay in browser memory and reset after a reload.
          </p>
          <button className="button-danger-outline" onClick={onDeleteData}>
            <Trash2 size={15} /> Delete all conversation data
          </button>
        </div>
      </section>
      <div className="settings-note">
        <strong>Connection security</strong>
        <p>
          Provider tokens and webhook secrets must be stored in the server environment. Never enter them into frontend
          code or commit them to the repository.
        </p>
      </div>
    </div>
  );
}
