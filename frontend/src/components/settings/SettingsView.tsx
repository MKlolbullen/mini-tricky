import type { Health } from '../../types';

type Props = {
  health: Health | null;
};

export default function SettingsView({ health }: Props) {
  return (
    <div className="settings-view">
      <h2>Settings</h2>

      <div className="settings-section">
        <div className="section-title">API Connection</div>
        <div className="inspector-card">
          <div className="meta-block">
            <strong>Backend URL</strong>
            <div className="path-line">http://127.0.0.1:5000</div>
          </div>
          <div className="meta-block">
            <strong>Status</strong>
            <div className={`status-pill ${health?.status === 'ok' ? 'ok' : 'warn'}`}>
              {health?.status || 'checking'}
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="section-title">About</div>
        <div className="inspector-card">
          <div className="meta-block">
            <strong>mini-tricky</strong>
            <div className="path-line">Local-first security workflow automation platform.</div>
            <div className="path-line">Build reusable, visual DAG workflows for bug bounty and offensive security.</div>
          </div>
          <div className="meta-block">
            <strong>Version</strong>
            <div>0.6.0</div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="section-title">Keyboard Shortcuts</div>
        <div className="inspector-card">
          <div className="shortcuts-list">
            <div className="shortcut-row"><kbd>Delete</kbd> <span>Remove selected node</span></div>
            <div className="shortcut-row"><kbd>Ctrl+S</kbd> <span>Save workflow</span></div>
            <div className="shortcut-row"><kbd>Ctrl+Enter</kbd> <span>Run workflow</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
