import { useEffect, useMemo, useState } from 'react';
import type { RunRecord, WorkflowRecord } from '../../types';
import * as api from '../../api';
import RunDetail from './RunDetail';

type Props = {
  onOpenInBuilder: (wf: WorkflowRecord) => void;
};

export default function RunsView({ onOpenInBuilder }: Props) {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    api.fetchRuns()
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    return runs.filter((r) => {
      const matchSearch = r.name.toLowerCase().includes(search.toLowerCase()) || r.id.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [runs, search, statusFilter]);

  const selectedRun = useMemo(() => {
    if (!selectedRunId) return null;
    return runs.find((r) => r.id === selectedRunId) || null;
  }, [runs, selectedRunId]);

  async function handleDelete(runId: string) {
    if (!confirm(`Delete run ${runId}?`)) return;
    await api.deleteRun(runId);
    if (selectedRunId === runId) setSelectedRunId(null);
    refresh();
  }

  if (selectedRun) {
    return (
      <RunDetail
        run={selectedRun}
        onBack={() => setSelectedRunId(null)}
        onOpenInBuilder={onOpenInBuilder}
        onDelete={() => handleDelete(selectedRun.id)}
      />
    );
  }

  return (
    <div className="runs-view">
      <div className="runs-header">
        <h2>Run History</h2>
        <p className="runs-subtitle">View and manage all workflow executions.</p>
      </div>

      <div className="runs-controls">
        <input className="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search runs..." />
        <div className="status-filters">
          {['all', 'completed', 'failed'].map((s) => (
            <button key={s} className={`cat-chip ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>
              {s === 'all' ? `All (${runs.length})` : s}
            </button>
          ))}
        </div>
        <button className="action-btn" onClick={refresh}>Refresh</button>
      </div>

      {loading ? (
        <div className="empty-state">Loading runs...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">No runs found. Execute a workflow from the Builder to see results here.</div>
      ) : (
        <div className="runs-table">
          <div className="runs-table-header">
            <span>Name</span>
            <span>Status</span>
            <span>Nodes</span>
            <span>Created</span>
            <span>Actions</span>
          </div>
          {filtered.map((r) => (
            <div key={r.id} className="runs-table-row" onClick={() => setSelectedRunId(r.id)}>
              <span className="run-name">{r.name}</span>
              <span>
                <span className={`status-badge ${r.status}`}>{r.status}</span>
              </span>
              <span>{Object.keys(r.node_states).length}</span>
              <span className="run-date">{r.created_at ? new Date(r.created_at).toLocaleString() : 'N/A'}</span>
              <span>
                <button className="action-btn small" onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}>Delete</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
