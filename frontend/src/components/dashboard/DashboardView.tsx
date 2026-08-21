import { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import type { Health, RunRecord, WorkflowRecord } from '../../types';
import { PlusIcon, PlayIcon, SparkleIcon, TemplatesIcon, NodesIcon, ClockIcon } from '../Icons';

type Props = {
  workflows: WorkflowRecord[];
  health: Health | null;
  onNewWorkflow: () => void;
  onGenerate: () => void;
  onBrowseTemplates: () => void;
  onOpenWorkflow: (wf: WorkflowRecord) => void;
  onOpenRuns: () => void;
  onViewLibrary: () => void;
};

function statusClass(status: string): string {
  if (status === 'success' || status === 'completed') return 'ok';
  if (status === 'failed' || status === 'error' || status === 'blocked') return 'fail';
  if (status === 'running') return 'run';
  return 'idle';
}

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default function DashboardView({
  workflows,
  health,
  onNewWorkflow,
  onGenerate,
  onBrowseTemplates,
  onOpenWorkflow,
  onOpenRuns,
  onViewLibrary,
}: Props) {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [toolStats, setToolStats] = useState<{ installed: number; total: number } | null>(null);

  useEffect(() => {
    api.fetchRuns().then(setRuns).catch(() => setRuns([]));
    api
      .fetchToolsHealth()
      .then((h) => setToolStats({ installed: h.installed, total: h.total }))
      .catch(() => setToolStats(null));
  }, []);

  const stats = useMemo(() => {
    const finished = runs.filter((r) => r.status === 'success' || r.status === 'failed' || r.status === 'completed' || r.status === 'error');
    const succeeded = runs.filter((r) => r.status === 'success' || r.status === 'completed').length;
    const successRate = finished.length ? Math.round((succeeded / finished.length) * 100) : null;
    return {
      workflows: workflows.length,
      executions: runs.length,
      successRate,
      tools: toolStats,
    };
  }, [workflows, runs, toolStats]);

  const recentWorkflows = useMemo(() => workflows.slice(0, 6), [workflows]);
  const recentRuns = useMemo(() => {
    const sorted = [...runs].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    return sorted.slice(0, 7);
  }, [runs]);

  const online = health?.status === 'ok';

  return (
    <div className="page dashboard">
      <div className="page-head">
        <div>
          <h1 className="page-title">Welcome to mini-tricky</h1>
          <p className="page-sub">
            Build, run, and monitor offensive-security workflows — locally.
            {' '}
            <span className={online ? 'inline-ok' : 'inline-warn'}>
              {online ? 'Engine online' : 'Engine offline'}
            </span>
          </p>
        </div>
        <button className="btn btn-primary" onClick={onNewWorkflow}>
          <PlusIcon size={18} /> New Workflow
        </button>
      </div>

      {/* Stat cards */}
      <div className="stat-grid">
        <button className="stat-card" onClick={onViewLibrary}>
          <div className="stat-value">{stats.workflows}</div>
          <div className="stat-label">Workflows</div>
        </button>
        <button className="stat-card" onClick={onOpenRuns}>
          <div className="stat-value">{stats.executions}</div>
          <div className="stat-label">Executions</div>
        </button>
        <div className="stat-card">
          <div className="stat-value">{stats.successRate === null ? '—' : `${stats.successRate}%`}</div>
          <div className="stat-label">Success rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {stats.tools ? `${stats.tools.installed}/${stats.tools.total}` : '—'}
          </div>
          <div className="stat-label">Tools installed</div>
        </div>
      </div>

      {/* Quick-start actions */}
      <div className="quick-actions">
        <button className="quick-action" onClick={onNewWorkflow}>
          <span className="qa-icon build"><NodesIcon size={22} /></span>
          <span className="qa-text">
            <strong>Start from scratch</strong>
            <span>Drag tools onto the canvas and wire them up.</span>
          </span>
        </button>
        <button className="quick-action" onClick={onGenerate}>
          <span className="qa-icon ai"><SparkleIcon size={22} /></span>
          <span className="qa-text">
            <strong>Generate with AI</strong>
            <span>Describe an objective, get a ready workflow.</span>
          </span>
        </button>
        <button className="quick-action" onClick={onBrowseTemplates}>
          <span className="qa-icon tpl"><TemplatesIcon size={22} /></span>
          <span className="qa-text">
            <strong>Browse templates</strong>
            <span>Battle-tested recon &amp; scanning pipelines.</span>
          </span>
        </button>
      </div>

      <div className="dash-columns">
        {/* Recent workflows */}
        <section className="dash-panel">
          <div className="dash-panel-head">
            <h2>Recent workflows</h2>
            <button className="link-btn" onClick={onViewLibrary}>View all</button>
          </div>
          {recentWorkflows.length === 0 ? (
            <div className="empty-state">
              <p>No workflows yet.</p>
              <button className="btn btn-ghost" onClick={onNewWorkflow}>Create your first</button>
            </div>
          ) : (
            <div className="mini-card-grid">
              {recentWorkflows.map((wf) => (
                <button key={wf.id} className="mini-card" onClick={() => onOpenWorkflow(wf)}>
                  <div className="mini-card-title">{wf.name || 'Untitled'}</div>
                  <div className="mini-card-meta">
                    <span><NodesIcon size={13} /> {wf.graph?.nodes?.length ?? 0} nodes</span>
                    {wf.version ? <span>v{wf.version}</span> : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Recent executions */}
        <section className="dash-panel">
          <div className="dash-panel-head">
            <h2>Recent executions</h2>
            <button className="link-btn" onClick={onOpenRuns}>View all</button>
          </div>
          {recentRuns.length === 0 ? (
            <div className="empty-state">
              <p>No executions yet.</p>
            </div>
          ) : (
            <ul className="run-feed">
              {recentRuns.map((run) => (
                <li key={run.id} className="run-feed-item" onClick={onOpenRuns}>
                  <span className={`run-dot ${statusClass(run.status)}`} />
                  <span className="run-feed-name">{run.name || run.id}</span>
                  <span className="run-feed-status">{run.status}</span>
                  <span className="run-feed-time">
                    <ClockIcon size={12} /> {relativeTime(run.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="dash-footer-hint">
        <PlayIcon size={14} /> Tip: press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> in the builder to run a workflow.
      </div>
    </div>
  );
}
