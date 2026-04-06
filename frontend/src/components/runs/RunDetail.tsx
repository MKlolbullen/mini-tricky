import { useEffect, useState } from 'react';
import type { RunRecord, ArtifactItem, WorkflowRecord } from '../../types';
import * as api from '../../api';

type Props = {
  run: RunRecord;
  onBack: () => void;
  onOpenInBuilder: (wf: WorkflowRecord) => void;
  onDelete: () => void;
};

export default function RunDetail({ run, onBack, onOpenInBuilder, onDelete }: Props) {
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  useEffect(() => {
    api.fetchRunArtifacts(run.id)
      .then((d) => setArtifacts(d.items || []))
      .catch(() => setArtifacts([]));
  }, [run.id]);

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
          <button className="action-btn danger" onClick={onDelete}>Delete Run</button>
        </div>
      </div>

      <div className="run-detail-meta">
        <div><strong>Run ID:</strong> {run.id}</div>
        <div><strong>Created:</strong> {run.created_at ? new Date(run.created_at).toLocaleString() : 'N/A'}</div>
        <div><strong>Nodes:</strong> {Object.keys(run.node_states).length}</div>
        <div><strong>Artifact Root:</strong> <span className="path-line">{run.artifact_root}</span></div>
      </div>

      <div className="section-title">Node Results</div>
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
                      {result.artifact_paths.map((p, i) => (
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

      {artifacts.length > 0 && (
        <>
          <div className="section-title">All Artifacts</div>
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
        </>
      )}

      <div className="section-title">Run Logs</div>
      <pre className="console-output run-logs">{run.logs.join('\n')}</pre>
    </div>
  );
}
