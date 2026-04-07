import { useEffect, useState } from 'react';
import type { RunRecord, ArtifactItem, WorkflowRecord } from '../../types';
import * as api from '../../api';

type Props = {
  run: RunRecord;
  onBack: () => void;
  onOpenInBuilder: (wf: WorkflowRecord) => void;
  onDelete: () => void;
};

type DetailTab = 'results' | 'normalized' | 'artifacts' | 'logs';

export default function RunDetail({ run, onBack, onOpenInBuilder, onDelete }: Props) {
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>('results');
  const [normalized, setNormalized] = useState<any>(null);
  const [normalizedLoading, setNormalizedLoading] = useState(false);

  useEffect(() => {
    api.fetchRunArtifacts(run.id)
      .then((d) => setArtifacts(d.items || []))
      .catch(() => setArtifacts([]));
  }, [run.id]);

  useEffect(() => {
    if (tab === 'normalized' && !normalized) {
      setNormalizedLoading(true);
      api.fetchNormalizedResults(run.id)
        .then(setNormalized)
        .catch(() => setNormalized({ ok: false }))
        .finally(() => setNormalizedLoading(false));
    }
  }, [tab, run.id, normalized]);

  function handleOpenInBuilder() {
    if (run.graph) {
      onOpenInBuilder({ id: run.id, name: run.name, graph: run.graph });
    }
  }

  return (
    <div className="run-detail">
      <div className="run-detail-header">
        <button className="action-btn" onClick={onBack}>&larr; Back to Runs</button>
        <div className="run-detail-title">
          <h2>{run.name}</h2>
          <span className={`status-badge ${run.status}`}>{run.status}</span>
        </div>
        <div className="run-detail-actions">
          {run.graph && <button className="action-btn" onClick={handleOpenInBuilder}>Open in Builder</button>}
          <a className="action-btn" href={api.reportDownloadUrl(run.id, 'markdown')} download>Export Report</a>
          <button className="action-btn danger" onClick={onDelete}>Delete Run</button>
        </div>
      </div>

      <div className="run-detail-meta">
        <div><strong>Run ID:</strong> {run.id}</div>
        <div><strong>Created:</strong> {run.created_at ? new Date(run.created_at).toLocaleString() : 'N/A'}</div>
        <div><strong>Nodes:</strong> {Object.keys(run.node_states).length}</div>
      </div>

      <div className="run-detail-tabs">
        <button className={`arg-tab ${tab === 'results' ? 'active' : ''}`} onClick={() => setTab('results')}>Node Results</button>
        <button className={`arg-tab ${tab === 'normalized' ? 'active' : ''}`} onClick={() => setTab('normalized')}>Findings</button>
        <button className={`arg-tab ${tab === 'artifacts' ? 'active' : ''}`} onClick={() => setTab('artifacts')}>Artifacts ({artifacts.length})</button>
        <button className={`arg-tab ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>Logs</button>
      </div>

      {tab === 'results' && (
        <>
          <div className="node-results-table">
            <div className="node-results-header">
              <span>Node</span>
              <span>Status</span>
              <span>Exit Code</span>
              <span>Command</span>
            </div>
            {Object.entries(run.node_results).map(([nodeId, result]) => (
              <div key={nodeId}>
                <div className="node-results-row" onClick={() => setExpandedNode(expandedNode === nodeId ? null : nodeId)}>
                  <span className="run-name">{nodeId}</span>
                  <span><span className={`status-badge ${result.status}`}>{result.status}</span></span>
                  <span>{result.exit_code ?? 'N/A'}</span>
                  <span className="run-date">{result.command?.join(' ').slice(0, 60) || 'N/A'}</span>
                </div>
                {expandedNode === nodeId && (
                  <div className="node-expanded">
                    <div className="node-expanded-section">
                      <strong>STDOUT</strong>
                      <pre className="console-output">{result.stdout_preview || '(empty)'}</pre>
                    </div>
                    <div className="node-expanded-section">
                      <strong>STDERR</strong>
                      <pre className="console-output">{result.stderr_preview || '(empty)'}</pre>
                    </div>
                    {result.artifact_paths.length > 0 && (
                      <div className="node-expanded-section">
                        <strong>Artifacts</strong>
                        <ul>
                          {result.artifact_paths.map((p: string, i: number) => (
                            <li key={i}>
                              <a className="action-link" href={api.artifactRawUrl(run.id, p)} target="_blank" rel="noreferrer" download>
                                {p.split('/').pop()}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'normalized' && (
        <div className="normalized-view">
          {normalizedLoading && <div className="empty-state compact">Normalizing results...</div>}
          {normalized?.ok && (
            <>
              <div className="normalized-summary">
                <div className="health-stat">
                  <span className="health-stat-number">{normalized.summary?.total_items || 0}</span>
                  <span className="health-stat-label">Total Items</span>
                </div>
                {normalized.summary?.by_type && Object.entries(normalized.summary.by_type).map(([type, count]) => (
                  <div key={type} className="health-stat">
                    <span className="health-stat-number">{count as number}</span>
                    <span className="health-stat-label">{type.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>

              {normalized.summary?.by_severity && Object.keys(normalized.summary.by_severity).length > 0 && (
                <div className="severity-summary">
                  <div className="section-title">Severity Breakdown</div>
                  <div className="severity-bars">
                    {Object.entries(normalized.summary.by_severity as Record<string, number>)
                      .sort(([a], [b]) => {
                        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
                        return (order[a] ?? 5) - (order[b] ?? 5);
                      })
                      .map(([sev, count]) => (
                        <div key={sev} className={`severity-bar ${sev}`}>
                          <span className="severity-label">{sev}</span>
                          <div className="severity-fill" style={{ width: `${Math.min(100, ((count as number) / (normalized.summary?.total_items || 1)) * 100)}%` }} />
                          <span className="severity-count">{count as number}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="section-title">Items ({normalized.items?.length || 0})</div>
              <div className="normalized-items">
                {(normalized.items || []).slice(0, 200).map((item: any, i: number) => (
                  <div key={i} className="normalized-item">
                    <span className={`norm-type-badge ${item.type}`}>{item.type.replace('_', ' ')}</span>
                    {item.severity && <span className={`norm-severity ${item.severity}`}>{item.severity}</span>}
                    <span className="norm-target">{item.target || item.raw}</span>
                    <span className="norm-node">{item.node_id}</span>
                  </div>
                ))}
                {(normalized.items || []).length > 200 && (
                  <div className="empty-state compact">Showing first 200 of {normalized.items.length} items</div>
                )}
              </div>
            </>
          )}
          {normalized && !normalized.ok && <div className="empty-state compact">Failed to normalize results.</div>}
        </div>
      )}

      {tab === 'artifacts' && (
        <>
          {artifacts.length > 0 ? (
            <div className="artifacts-grid">
              {artifacts.map((a) => (
                <a
                  key={a.id}
                  className="artifact-download-card"
                  href={api.artifactRawUrl(run.id, a.path)}
                  download={a.name}
                >
                  <strong>{a.name}</strong>
                  <span>{a.node_id} &middot; {a.size_bytes} bytes</span>
                </a>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">No artifacts for this run.</div>
          )}
        </>
      )}

      {tab === 'logs' && (
        <pre className="console-output run-logs">{run.logs.join('\n')}</pre>
      )}
    </div>
  );
}
