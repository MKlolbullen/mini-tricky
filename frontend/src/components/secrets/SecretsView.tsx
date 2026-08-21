import { useEffect, useState } from 'react';
import * as api from '../../api';
import type { Profile } from '../../api';
import { SECRET_MASK } from '../../api';
import { PlusIcon, KeyIcon, TrashIcon } from '../Icons';

type EnvRow = { key: string; value: string };

function envToRows(env: Record<string, string>): EnvRow[] {
  return Object.entries(env).map(([key, value]) => ({ key, value }));
}

function ProfileForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: Profile | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [rows, setRows] = useState<EnvRow[]>(initial ? envToRows(initial.env_vars || {}) : [{ key: '', value: '' }]);
  const [saving, setSaving] = useState(false);

  function updateRow(i: number, patch: Partial<EnvRow>) {
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() { setRows((cur) => [...cur, { key: '', value: '' }]); }
  function removeRow(i: number) { setRows((cur) => cur.filter((_, idx) => idx !== i)); }

  async function handleSave() {
    if (!name.trim()) return;
    const env_vars: Record<string, string> = {};
    for (const r of rows) {
      if (r.key.trim()) env_vars[r.key.trim()] = r.value;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim(),
      tool_overrides: initial?.tool_overrides || {},
      env_vars,
    };
    try {
      if (initial) await api.updateProfile(initial.id, payload);
      else await api.saveProfile(payload);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-card">
      <div className="form-row">
        <label className="form-field">
          <span>Profile name</span>
          <input className="form-input" value={name} placeholder="Production keys" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="form-field">
          <span>Description</span>
          <input className="form-input" value={description} placeholder="Shodan, Censys, VirusTotal…" onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>

      <div className="form-field">
        <span>Environment variables &amp; secrets</span>
        <div className="env-editor">
          {rows.map((r, i) => {
            const isSecret = r.value === SECRET_MASK;
            return (
              <div className="env-row" key={i}>
                <input
                  className="form-input mono"
                  placeholder="KEY_NAME"
                  value={r.key}
                  onChange={(e) => updateRow(i, { key: e.target.value })}
                />
                <input
                  className={`form-input mono ${isSecret ? 'is-masked' : ''}`}
                  placeholder="value"
                  value={r.value}
                  onFocus={() => { if (r.value === SECRET_MASK) updateRow(i, { value: '' }); }}
                  onChange={(e) => updateRow(i, { value: e.target.value })}
                />
                <button className="icon-btn" onClick={() => removeRow(i)} title="Remove"><TrashIcon size={14} /></button>
              </div>
            );
          })}
          <button className="btn btn-ghost btn-sm" onClick={addRow}><PlusIcon size={14} /> Add variable</button>
        </div>
        <span className="form-hint">
          Keys like <code>*_API_KEY</code>, <code>*_TOKEN</code>, <code>*_SECRET</code>, <code>*_PASSWORD</code> are stored in the
          OS keychain and never sent back in clear text. A field showing <code>••••••••</code> is a stored secret — leave it to keep the current value.
        </span>
      </div>

      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim() || saving}>
          {initial ? 'Save changes' : 'Create profile'}
        </button>
      </div>
    </div>
  );
}

export default function SecretsView() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);

  function refresh() {
    setLoading(true);
    api.fetchProfiles().then(setProfiles).catch(() => setProfiles([])).finally(() => setLoading(false));
  }

  useEffect(() => { refresh(); }, []);

  async function handleDelete(p: Profile) {
    if (!window.confirm(`Delete profile "${p.name}" and its stored secrets?`)) return;
    await api.deleteProfile(p.id);
    refresh();
  }

  const formOpen = creating || editing !== null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Secrets</h1>
          <p className="page-sub">Environment profiles for API keys and tokens — secrets are stored in the OS keychain.</p>
        </div>
        {!formOpen && (
          <button className="btn btn-primary" onClick={() => { setCreating(true); setEditing(null); }}>
            <PlusIcon size={18} /> New Profile
          </button>
        )}
      </div>

      {formOpen ? (
        <ProfileForm
          initial={editing}
          onCancel={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
        />
      ) : loading ? (
        <div className="empty-state">Loading profiles…</div>
      ) : profiles.length === 0 ? (
        <div className="empty-state">
          <p>No environment profiles yet.</p>
          <button className="btn btn-ghost" onClick={() => setCreating(true)}><PlusIcon size={16} /> Create your first</button>
        </div>
      ) : (
        <div className="secret-grid">
          {profiles.map((p) => {
            const env = Object.entries(p.env_vars || {});
            return (
              <div key={p.id} className="secret-card">
                <div className="secret-head">
                  <div className="secret-icon"><KeyIcon size={18} /></div>
                  <div className="secret-title-group">
                    <div className="secret-name">{p.name}</div>
                    {p.description && <div className="secret-desc">{p.description}</div>}
                  </div>
                </div>
                <div className="secret-vars">
                  {env.length === 0 ? (
                    <span className="secret-empty">No variables set.</span>
                  ) : (
                    env.map(([k, v]) => {
                      const isSecret = v === SECRET_MASK;
                      return (
                        <div className="secret-var" key={k}>
                          <span className="secret-key mono">{k}</span>
                          <span className={`secret-val mono ${isSecret ? 'is-secret' : ''}`}>{v || '—'}</span>
                          {isSecret && <span className="secret-badge">keychain</span>}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="secret-actions">
                  <button className="btn btn-sm" onClick={() => { setEditing(p); setCreating(false); }}>Edit</button>
                  <button className="icon-btn danger" onClick={() => handleDelete(p)} title="Delete profile"><TrashIcon size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
