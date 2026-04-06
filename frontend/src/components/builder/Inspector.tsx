import type { FlowNode, Tool, RunRecord, ReplayRecord, ArtifactItem, ArtifactPreview, WorkflowNodePayload } from '../../types';
import { artifactRawUrl } from '../../api';

type Props = {
  selectedNode: FlowNode | null;
  selectedTool: Tool | null;
  lastRun: RunRecord | null;
  selectedRunNode: any | null;
  selectedReplay: ReplayRecord | null;
  isReplaying: boolean;
  onReplay: () => void;
  onUpdateNodeData: (nodeId: string, patch: Partial<WorkflowNodePayload>) => void;
  artifactItems: ArtifactItem[];
  selectedArtifactPath: string | null;
  onSelectArtifact: (path: string) => void;
  artifactPreview: ArtifactPreview | null;
  artifactLoading: boolean;
};

export default function Inspector({
  selectedNode,
  selectedTool,
  lastRun,
  selectedRunNode,
  selectedReplay,
  isReplaying,
  onReplay,
  onUpdateNodeData,
  artifactItems,
  selectedArtifactPath,
  onSelectArtifact,
  artifactPreview,
  artifactLoading,
}: Props) {
  const selectedArtifact = selectedArtifactPath ? artifactItems.find((i) => i.path === selectedArtifactPath) || null : null;
  const rawUrl = lastRun?.id && selectedArtifact ? artifactRawUrl(lastRun.id, selectedArtifact.path) : null;

  return (
    <aside className="sidebar right">
      <div className="section-title">Inspector</div>
      {selectedNode ? (
        <div className="inspector-card">
          <h3>{selectedNode.data.label}</h3>
          <p>{selectedNode.data.kind === 'tool' ? `Tool: ${selectedNode.data.toolId}` : `Node: ${selectedNode.data.kind}`}</p>

          <div className="meta-block">
            <strong>Inputs</strong>
            <ul>{selectedNode.data.inputs.map((v) => <li key={v}>{v}</li>)}</ul>
          </div>

          <div className="meta-block">
            <strong>Outputs</strong>
            <ul>{selectedNode.data.outputs.map((v) => <li key={v}>{v}</li>)}</ul>
          </div>

          {selectedNode.data.kind === 'variable' && (
            <div className="meta-block">
              <strong>Value</strong>
              <textarea
                className="inspector-textarea"
                value={selectedNode.data.value || ''}
                placeholder="example.com"
                onChange={(e) => onUpdateNodeData(selectedNode.id, { value: e.target.value })}
              />
            </div>
          )}

          {selectedNode.data.kind === 'tool' && selectedTool && (
            <>
              <div className="meta-block">
                <strong>Command Template</strong>
                <pre className="code-block">{(selectedTool.command || []).join(' ') || 'No command configured.'}</pre>
              </div>
              <div className="meta-block">
                <strong>Timeout</strong>
                <div>{selectedTool.timeout_seconds || 0}s</div>
              </div>
            </>
          )}

          {selectedNode.data.kind === 'script' && (
            <>
              <div className="meta-block">
                <strong>Language</strong>
                <div className="script-lang-badge">{selectedNode.data.scriptLanguage || 'bash'}</div>
              </div>
              <div className="meta-block">
                <strong>Script Body</strong>
                <textarea
                  className="inspector-textarea script-editor"
                  value={selectedNode.data.scriptBody || ''}
                  placeholder={selectedNode.data.scriptLanguage === 'python' ? '# Python script...' : '#!/bin/bash\n# Bash script...'}
                  onChange={(e) => onUpdateNodeData(selectedNode.id, { scriptBody: e.target.value })}
                  spellCheck={false}
                />
              </div>
            </>
          )}

          {selectedNode.data.runState && (
            <div className="meta-block">
              <strong>Last Run State</strong>
              <div>{selectedNode.data.runState}</div>
            </div>
          )}

          {lastRun && (
            <div className="meta-block">
              <strong>Replay</strong>
              <button className="action-btn" onClick={onReplay} disabled={isReplaying}>
                {isReplaying ? 'Replaying...' : `Replay ${selectedNode.id}`}
              </button>
              <div className="path-line">Runs the selected node again using cached upstream outputs.</div>
            </div>
          )}

          {selectedReplay && (
            <div className="meta-block">
              <strong>Latest Replay</strong>
              <div>{selectedReplay.id}</div>
              <div className="path-line">Parents reused: {selectedReplay.used_cached_upstream_from.join(', ') || 'none'}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">Select a node to inspect its typed sockets, values, and last-run output.</div>
      )}

      <div className="section-title">Last Run</div>
      {lastRun ? (
        <div className="inspector-card">
          <h3>{lastRun.name}</h3>
          <p>Status: {lastRun.status}</p>
          <div className="meta-block">
            <strong>Artifact Root</strong>
            <div className="path-line">{lastRun.artifact_root}</div>
          </div>
          <div className="meta-block">
            <strong>Parallel Groups</strong>
            <ul>{lastRun.parallel_groups.map((g, i) => <li key={i}>[{g.join(', ')}]</li>)}</ul>
          </div>
          <div className="meta-block">
            <strong>Node States</strong>
            <ul>{Object.entries(lastRun.node_states).map(([id, state]) => <li key={id}>{id}: {state}</li>)}</ul>
          </div>
          <div className="meta-block">
            <strong>Replays</strong>
            {lastRun.replays && lastRun.replays.length > 0 ? (
              <ul>{lastRun.replays.map((r) => <li key={r.id}>{r.id}: {r.node_id}</li>)}</ul>
            ) : (
              <div className="path-line">No node replays yet.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="empty-state">No runs yet.</div>
      )}

      <div className="section-title">Artifact Explorer</div>
      <div className="artifact-explorer">
        <div className="artifact-list">
          {artifactItems.length === 0 && <div className="empty-mini">No artifacts yet.</div>}
          {artifactItems.map((item) => (
            <button
              key={item.id}
              className={`artifact-list-item ${selectedArtifactPath === item.path ? 'selected' : ''}`}
              onClick={() => onSelectArtifact(item.path)}
            >
              <strong>{item.name}</strong>
              <span>{item.node_id} &middot; {item.source}</span>
            </button>
          ))}
        </div>

        <div className="artifact-preview-wrap">
          <div className="artifact-preview-toolbar">
            <div className="artifact-preview-meta">
              <strong>{selectedArtifact?.name || 'No artifact selected'}</strong>
              <span>{selectedArtifact ? `${selectedArtifact.node_id} \u00b7 ${selectedArtifact.size_bytes} bytes` : 'Choose an artifact from the list.'}</span>
            </div>
            {rawUrl && (
              <div className="artifact-preview-actions">
                <a className="action-link" href={rawUrl} target="_blank" rel="noreferrer">Open raw</a>
                <a className="action-link" href={rawUrl} download={selectedArtifact?.name}>Download</a>
              </div>
            )}
          </div>
          <div className="artifact-preview-body">
            {renderPreview(lastRun, selectedArtifact, artifactLoading, artifactPreview)}
          </div>
        </div>
      </div>
    </aside>
  );
}

function renderPreview(lastRun: RunRecord | null, selectedArtifact: ArtifactItem | null, loading: boolean, preview: ArtifactPreview | null) {
  if (!lastRun) return <div className="empty-state compact">Run a workflow to browse artifacts here.</div>;
  if (!selectedArtifact) return <div className="empty-state compact">Select an artifact to preview it.</div>;
  if (loading) return <div className="empty-state compact">Loading artifact preview...</div>;
  if (!preview) return <div className="empty-state compact">Preview unavailable.</div>;
  if (!preview.ok) return <div className="empty-state compact">{preview.error}</div>;

  if (preview.kind === 'image') {
    return (
      <div className="artifact-preview-surface">
        <img className="artifact-preview-image" src={preview.image_data_url} alt={preview.name} />
      </div>
    );
  }
  if (preview.kind === 'json') {
    return <pre className="artifact-preview-text">{JSON.stringify(preview.json_content, null, 2)}</pre>;
  }
  if (preview.kind === 'html') {
    return <iframe className="artifact-preview-frame" sandbox="" srcDoc={preview.html_content} title={preview.name} />;
  }
  if (preview.kind === 'text') {
    return <pre className="artifact-preview-text">{preview.text_content}</pre>;
  }
  return (
    <div className="artifact-preview-binary">
      <div>No inline preview for this file type.</div>
      <div className="path-line">{preview.mime_type}</div>
    </div>
  );
}
