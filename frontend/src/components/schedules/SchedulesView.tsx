import { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import type { Schedule } from '../../api';
import type { WorkflowRecord } from '../../types';
import { PlusIcon, CalendarIcon, TrashIcon, ClockIcon } from '../Icons';

type Props = {
  workflows: WorkflowRecord[];
};

const CRON_PRESETS: { label: string; cron: string }[] = [
  { label: 'Every 15 min', cron: '*/15 * * * *' },
  { label: 'Hourly', cron: '0 * * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Daily 02:00', cron: '0 2 * * *' },
  { label: 'Weekly (Mon)', cron: '0 3 * * 1' },
];

function humanizeCron(cron: string): string {
  const preset = CRON_PRESETS.find((p) => p.cron === cron);
  if (preset) return preset.label;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour, dom, mon, dow] = parts;
  if (min.startsWith('*/')) return `Every ${min.slice(2)} minutes`;
  if (hour === '*' && min === '0') return 'Every hour';
  if (dom === '*' && mon === '*' && dow === '*' && /^\d+$/.test(hour)) {
    return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }
  return cron;
}

export default function SchedulesView({ workflows }: Props) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [wfId, setWfId] = useState('');
  const [name, setName] = useState('');
  const [cron, setCron] = useState('0 * * * *');
  const [workers, setWorkers] = useState(2);

  const workflowName = useMemo(() => {
    const m = new Map(workflows.map((w) => [w.id, w.name]));
    return (id: string) => m.get(id) || id;
  }, [workflows]);

  function refresh() {
    setLoading(true);
    api.fetchSchedules().then(setSchedules).catch(() => setSchedules([])).finally(() => setLoading(false));
  }

  useEffect(() => { refresh(); }, []);

  async function handleCreate() {
    if (!wfId) return;
    await api.createSchedule({
      workflow_id: wfId,
      name: name.trim() || `${workflowName(wfId)} schedule`,
      cron,
      max_parallel: workers,
      enabled: true,
    });
    setShowForm(false);
    setWfId(''); setName(''); setCron('0 * * * *'); setWorkers(2);
    refresh();
  }

  async function handleToggle(id: string) {
    await api.toggleSchedule(id);
    refresh();
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this schedule?')) return;
    await api.deleteSchedule(id);
    refresh();
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Schedules</h1>
          <p className="page-sub">Run workflows automatically on a cron cadence.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)} disabled={workflows.length === 0}>
          <PlusIcon size={18} /> New Schedule
        </button>
      </div>

      {workflows.length === 0 && (
        <div className="empty-state">
          <p>Save a workflow first — schedules run a stored workflow on a timer.</p>
        </div>
      )}

      {showForm && workflows.length > 0 && (
        <div className="form-card">
          <div className="form-row">
            <label className="form-field">
              <span>Workflow</span>
              <select className="form-input" value={wfId} onChange={(e) => setWfId(e.target.value)}>
                <option value="">Select a workflow…</option>
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>{w.name || w.id}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Name</span>
              <input className="form-input" value={name} placeholder="Nightly recon" onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="form-field narrow">
              <span>Workers</span>
              <input className="form-input" type="number" min={1} max={16} value={workers} onChange={(e) => setWorkers(Math.max(1, Number(e.target.value) || 1))} />
            </label>
          </div>
          <div className="form-field">
            <span>Schedule</span>
            <div className="cron-presets">
              {CRON_PRESETS.map((p) => (
                <button key={p.cron} className={`chip ${cron === p.cron ? 'active' : ''}`} onClick={() => setCron(p.cron)}>
                  {p.label}
                </button>
              ))}
            </div>
            <input className="form-input mono" value={cron} onChange={(e) => setCron(e.target.value)} placeholder="min hour dom mon dow" />
            <span className="form-hint">{humanizeCron(cron)} · standard 5-field cron (UTC)</span>
          </div>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={!wfId}>Create schedule</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty-state">Loading schedules…</div>
      ) : schedules.length === 0 && workflows.length > 0 && !showForm ? (
        <div className="empty-state">
          <p>No schedules yet.</p>
          <button className="btn btn-ghost" onClick={() => setShowForm(true)}><PlusIcon size={16} /> Create one</button>
        </div>
      ) : (
        <div className="sched-list">
          {schedules.map((s) => (
            <div key={s.id} className={`sched-card ${s.enabled ? '' : 'disabled'}`}>
              <div className="sched-icon"><CalendarIcon size={20} /></div>
              <div className="sched-main">
                <div className="sched-name">{s.name}</div>
                <div className="sched-meta">
                  <span>{workflowName(s.workflow_id)}</span>
                  <span className="sched-cron"><ClockIcon size={12} /> {humanizeCron(s.cron)}</span>
                  <span className="mono sched-raw">{s.cron}</span>
                </div>
              </div>
              <div className="sched-actions">
                <button
                  className={`toggle-pill ${s.enabled ? 'on' : 'off'}`}
                  onClick={() => handleToggle(s.id)}
                  title={s.enabled ? 'Enabled — click to pause' : 'Paused — click to enable'}
                >
                  <span className="toggle-knob" />
                  <span className="toggle-text">{s.enabled ? 'Active' : 'Paused'}</span>
                </button>
                <button className="icon-btn danger" onClick={() => handleDelete(s.id)} title="Delete schedule">
                  <TrashIcon size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
