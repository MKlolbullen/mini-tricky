import { useEffect, useState } from 'react';
import type { Health } from '../../types';
import {
  fetchToolsHealth,
  fetchInstallScript,
  fetchProfiles,
  saveProfile,
  deleteProfile,
  type ToolHealth,
  type Profile,
} from '../../api';

type Props = {
  health: Health | null;
};

type SettingsTab = 'general' | 'tools' | 'profiles';

export default function SettingsView({ health }: Props) {
  const [tab, setTab] = useState<SettingsTab>('general');
  const [toolsHealth, setToolsHealth] = useState<ToolHealth[]>([]);
  const [toolsSummary, setToolsSummary] = useState({ total: 0, installed: 0, missing: 0 });
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolFilter, setToolFilter] = useState<'all' | 'installed' | 'missing'>('all');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [installScriptStatus, setInstallScriptStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');

  function loadToolsHealth() {
    setToolsLoading(true);
    fetchToolsHealth()
      .then((data) => {
        setToolsHealth(data.tools || []);
        setToolsSummary({ total: data.total, installed: data.installed, missing: data.missing });
      })
      .catch(() => setToolsHealth([]))
      .finally(() => setToolsLoading(false));
  }

  function loadProfiles() {
    fetchProfiles().then(setProfiles).catch(() => setProfiles([]));
  }

  async function copyInstallScript() {
    setInstallScriptStatus('copying');
    try {
      const script = await fetchInstallScript();
      await navigator.clipboard.writeText(script);
      setInstallScriptStatus('copied');
    } catch {
      setInstallScriptStatus('error');
    } finally {
      setTimeout(() => setInstallScriptStatus('idle'), 2500);
    }
  }

  useEffect(() => {
    if (tab === 'tools') loadToolsHealth();
    if (tab === 'profiles') loadProfiles();
  }, [tab]);

  const filteredTools = toolsHealth.filter((t) => {
    if (toolFilter === 'installed') return t.installed;
    if (toolFilter === 'missing') return !t.installed;
    return true;
  });

  return (
    <div className="settings-view">
      <div className="settings-tabs">
        <button className={`arg-tab ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>General</button>
        <button className={`arg-tab ${tab === 'tools' ? 'active' : ''}`} onClick={() => setTab('tools')}>Tool Manager</button>
        <button className={`arg-tab ${tab === 'profiles' ? 'active' : ''}`} onClick={() => setTab('profiles')}>Profiles</button>
      </div>

      {tab === 'general' && (
        <div className="settings-section">
          <div className="section-title">API Connection</div>
          <div className="arg-field">
            <div className="arg-field-header">
              <span className="arg-field-name">Backend URL</span>
              <span className={`arg-status-badge ${health?.status === 'ok' ? 'success' : 'failed'}`}>{health?.status || 'checking'}</span>
            </div>
            <div className="arg-field-value mono">http://127.0.0.1:5000</div>
          </div>

          <div className="section-title">About</div>
          <div className="arg-field">
            <div className="arg-field-header">
              <span className="arg-field-name">mini-tricky</span>
              <span className="arg-field-type">v0.7.0</span>
            </div>
            <div className="arg-field-desc">Local-first security workflow automation platform. Build reusable, visual DAG workflows for bug bounty and offensive security.</div>
          </div>

          <div className="section-title">Keyboard Shortcuts</div>
          <div className="shortcuts-grid">
            <div className="shortcut-row"><kbd>Ctrl+Z</kbd> <span>Undo</span></div>
            <div className="shortcut-row"><kbd>Ctrl+Shift+Z</kbd> <span>Redo</span></div>
            <div className="shortcut-row"><kbd>Delete</kbd> <span>Remove selected node</span></div>
            <div className="shortcut-row"><kbd>Ctrl+D</kbd> <span>Duplicate selected node</span></div>
            <div className="shortcut-row"><kbd>Ctrl+A</kbd> <span>Select all nodes</span></div>
            <div className="shortcut-row"><kbd>Ctrl+S</kbd> <span>Save workflow</span></div>
            <div className="shortcut-row"><kbd>Ctrl+Enter</kbd> <span>Run workflow</span></div>
            <div className="shortcut-row"><kbd>Ctrl+E</kbd> <span>Export workflow</span></div>
          </div>
        </div>
      )}

      {tab === 'tools' && (
        <div className="settings-section">
          <div className="tools-health-header">
            <div className="section-title">Tool Manager</div>
            <div className="tools-health-actions">
              <button
                className="action-btn small"
                onClick={copyInstallScript}
                disabled={installScriptStatus === 'copying'}
                title="Copy a bash script that installs every tool in tools.yaml"
              >
                {installScriptStatus === 'copying' && 'Generating...'}
                {installScriptStatus === 'copied' && 'Copied!'}
                {installScriptStatus === 'error' && 'Copy failed'}
                {installScriptStatus === 'idle' && 'Copy install script'}
              </button>
              <button className="action-btn small" onClick={loadToolsHealth} disabled={toolsLoading}>
                {toolsLoading ? 'Scanning...' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="tools-health-summary">
            <div className="health-stat">
              <span className="health-stat-number">{toolsSummary.total}</span>
              <span className="health-stat-label">Total</span>
            </div>
            <div className="health-stat installed">
              <span className="health-stat-number">{toolsSummary.installed}</span>
              <span className="health-stat-label">Installed</span>
            </div>
            <div className="health-stat missing">
              <span className="health-stat-number">{toolsSummary.missing}</span>
              <span className="health-stat-label">Missing</span>
            </div>
          </div>

          <div className="tools-health-filters">
            {(['all', 'installed', 'missing'] as const).map((f) => (
              <button
                key={f}
                className={`cat-chip ${toolFilter === f ? 'active' : ''}`}
                onClick={() => setToolFilter(f)}
              >
                {f === 'all' ? `All (${toolsSummary.total})` : f === 'installed' ? `Installed (${toolsSummary.installed})` : `Missing (${toolsSummary.missing})`}
              </button>
            ))}
          </div>

          <div className="tools-health-list">
            {toolsLoading && <div className="empty-state compact">Scanning PATH for installed tools...</div>}
            {!toolsLoading && filteredTools.map((t) => (
              <div key={t.id} className={`tool-health-item ${t.installed ? 'installed' : 'missing'}`}>
                <div className="tool-health-header">
                  <span className={`arg-socket-dot ${t.installed ? 'connected' : ''}`} />
                  <strong>{t.name}</strong>
                  <span className="tool-cat-badge" style={{ background: t.installed ? '#14381f' : '#4d1f1f', color: t.installed ? '#79f2a3' : '#ffabab' }}>
                    {t.installed ? 'Installed' : 'Missing'}
                  </span>
                </div>
                <div className="tool-health-details">
                  <span className="tool-health-binary">Binary: <code>{t.binary || 'N/A'}</code></span>
                  {t.installed && t.path && (
                    <span className="tool-health-path">Path: <code>{t.path}</code></span>
                  )}
                  {!t.installed && t.hint && (
                    <div className="tool-health-hint">
                      <span>Install:</span>
                      <code>{t.hint}</code>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'profiles' && (
        <div className="settings-section">
          <div className="tools-health-header">
            <div className="section-title">Environment Profiles</div>
            <button className="action-btn small" onClick={() => setShowNewProfile(!showNewProfile)}>
              {showNewProfile ? 'Cancel' : '+ New Profile'}
            </button>
          </div>
          <div className="arg-field-desc" style={{ marginBottom: 12 }}>
            Profiles let you define different tool configurations per target scope. Override tool parameters, set environment variables, and switch between configs.
          </div>

          {showNewProfile && (
            <NewProfileForm
              onSave={(p) => {
                saveProfile(p).then(() => { loadProfiles(); setShowNewProfile(false); });
              }}
              onCancel={() => setShowNewProfile(false)}
            />
          )}

          {profiles.length === 0 && !showNewProfile && (
            <div className="empty-state compact">No profiles yet. Create one to manage different tool configurations per target scope.</div>
          )}

          {profiles.map((p) => (
            <div key={p.id} className="arg-field" style={{ marginBottom: 8 }}>
              <div className="arg-field-header">
                <span className="arg-field-name">{p.name}</span>
                <button
                  className="arg-field-remove"
                  onClick={() => deleteProfile(p.id).then(loadProfiles)}
                >
                  &times;
                </button>
              </div>
              {p.description && <div className="arg-field-desc">{p.description}</div>}
              {Object.keys(p.tool_overrides).length > 0 && (
                <div className="profile-overrides">
                  <strong style={{ fontSize: 11, color: '#8eb8d4' }}>TOOL OVERRIDES</strong>
                  {Object.entries(p.tool_overrides).map(([toolId, params]) => (
                    <div key={toolId} className="profile-override-item">
                      <span>{toolId}:</span>
                      <code>{Object.entries(params).map(([k, v]) => `${k}=${v}`).join(', ')}</code>
                    </div>
                  ))}
                </div>
              )}
              {Object.keys(p.env_vars).length > 0 && (
                <div className="profile-overrides">
                  <strong style={{ fontSize: 11, color: '#8eb8d4' }}>ENV VARIABLES</strong>
                  {Object.entries(p.env_vars).map(([k, v]) => (
                    <div key={k} className="profile-override-item">
                      <span>{k}:</span>
                      <code>{v}</code>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewProfileForm({ onSave, onCancel }: {
  onSave: (p: { name: string; description: string; tool_overrides: Record<string, Record<string, string>>; env_vars: Record<string, string> }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [envVarsText, setEnvVarsText] = useState('');
  const [overridesText, setOverridesText] = useState('');

  function handleSave() {
    const env_vars: Record<string, string> = {};
    for (const line of envVarsText.split('\n')) {
      const [k, ...rest] = line.split('=');
      if (k?.trim()) env_vars[k.trim()] = rest.join('=').trim();
    }

    const tool_overrides: Record<string, Record<string, string>> = {};
    try {
      if (overridesText.trim()) {
        const parsed = JSON.parse(overridesText);
        Object.assign(tool_overrides, parsed);
      }
    } catch {
      // ignore invalid JSON
    }

    onSave({ name, description, tool_overrides, env_vars });
  }

  return (
    <div className="arg-field" style={{ marginBottom: 12 }}>
      <div className="arg-field-header">
        <span className="arg-field-name">New Profile</span>
      </div>
      <input className="arg-field-input" placeholder="Profile name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="arg-field-input" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginTop: 4 }} />
      <div style={{ marginTop: 8, fontSize: 11, color: '#8eb8d4' }}>Environment Variables (KEY=value, one per line)</div>
      <textarea className="arg-field-input" rows={3} placeholder="API_KEY=xxx&#10;SCOPE=wide" value={envVarsText} onChange={(e) => setEnvVarsText(e.target.value)} />
      <div style={{ marginTop: 8, fontSize: 11, color: '#8eb8d4' }}>Tool Overrides (JSON)</div>
      <textarea className="arg-field-input script-editor" rows={3} placeholder='{"nuclei": {"severity": "critical,high"}}' value={overridesText} onChange={(e) => setOverridesText(e.target.value)} />
      <div className="arg-add-param-actions" style={{ marginTop: 8 }}>
        <button className="action-btn small" onClick={handleSave} disabled={!name.trim()}>Create</button>
        <button className="action-btn small" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
