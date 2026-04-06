import { useEffect, useState } from 'react';
import type { FlowNode, Tool, RunRecord, ReplayRecord, ArtifactItem, ArtifactPreview, WorkflowNodePayload, WorkflowVersion } from '../../types';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../../types';
import { artifactRawUrl, fetchWorkflowVersions, restoreWorkflowVersion, fetchPresets, savePreset, deletePreset, type Preset } from '../../api';
import type { Edge } from '@xyflow/react';

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
  currentWorkflowId?: string | null;
  onRestoreVersion?: (wf: any) => void;
  edges: Edge[];
  onDeleteNode?: (nodeId: string) => void;
};

type InspectorTab = 'arguments' | 'output' | 'versions';

function getConnectionStatus(nodeId: string, handleId: string, edges: Edge[], direction: 'in' | 'out'): { connected: boolean; connectedTo?: string } {
  if (direction === 'in') {
    const edge = edges.find((e) => e.target === nodeId && e.targetHandle === `in:${handleId}`);
    return edge ? { connected: true, connectedTo: edge.source } : { connected: false };
  }
  const edge = edges.find((e) => e.source === nodeId && e.sourceHandle === `out:${handleId}`);
  return edge ? { connected: true, connectedTo: edge.target } : { connected: false };
}

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
  currentWorkflowId,
  onRestoreVersion,
  edges,
  onDeleteNode,
}: Props) {
  const selectedArtifact = selectedArtifactPath ? artifactItems.find((i) => i.path === selectedArtifactPath) || null : null;
  const rawUrl = lastRun?.id && selectedArtifact ? artifactRawUrl(lastRun.id, selectedArtifact.path) : null;
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [activeTab, setActiveTab] = useState<InspectorTab>('arguments');
  const [presets, setPresets] = useState<Preset[]>([]);

  // Load presets for the selected tool
  useEffect(() => {
    if (selectedNode?.data.kind === 'tool' && selectedNode.data.toolId) {
      fetchPresets(selectedNode.data.toolId).then(setPresets).catch(() => setPresets([]));
    } else {
      setPresets([]);
    }
  }, [selectedNode?.data.toolId, selectedNode?.data.kind]);

  useEffect(() => {
    if (currentWorkflowId) {
      fetchWorkflowVersions(currentWorkflowId).then(setVersions).catch(() => setVersions([]));
    } else {
      setVersions([]);
    }
  }, [currentWorkflowId]);

  // Reset to arguments tab when node selection changes
  useEffect(() => {
    setActiveTab('arguments');
  }, [selectedNode?.id]);

  return (
    <aside className="sidebar right">
      {/* ── Node Header ── */}
      {selectedNode ? (
        <>
          <div className="arg-panel-header">
            <div className="arg-panel-node-info">
              <span className="arg-panel-icon" style={getCategoryStyle(selectedNode)}>
                {getCategoryIcon(selectedNode)}
              </span>
              <div className="arg-panel-title">
                <input
                  className="arg-panel-name-input"
                  value={selectedNode.data.label}
                  onChange={(e) => onUpdateNodeData(selectedNode.id, { label: e.target.value })}
                />
                <span className="arg-panel-kind">{getKindLabel(selectedNode)}</span>
              </div>
            </div>

            {selectedNode.data.runState && (
              <span className={`arg-panel-state ${selectedNode.data.runState}`}>
                {selectedNode.data.runState}
              </span>
            )}

            <div className="arg-panel-actions">
              {lastRun && (
                <button className="action-btn small" onClick={onReplay} disabled={isReplaying}>
                  {isReplaying ? 'Replaying...' : 'Replay'}
                </button>
              )}
              {onDeleteNode && (
                <button className="action-btn small danger" onClick={() => onDeleteNode(selectedNode.id)}>Delete</button>
              )}
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="arg-panel-tabs">
            <button
              className={`arg-tab ${activeTab === 'arguments' ? 'active' : ''}`}
              onClick={() => setActiveTab('arguments')}
            >
              Arguments
            </button>
            <button
              className={`arg-tab ${activeTab === 'output' ? 'active' : ''}`}
              onClick={() => setActiveTab('output')}
            >
              Output
            </button>
            {versions.length > 0 && (
              <button
                className={`arg-tab ${activeTab === 'versions' ? 'active' : ''}`}
                onClick={() => setActiveTab('versions')}
              >
                History ({versions.length})
              </button>
            )}
          </div>

          {/* ── Arguments Tab ── */}
          {activeTab === 'arguments' && (
            <div className="arg-panel-body">
              {/* Input Sockets */}
              {selectedNode.data.inputs.length > 0 && (
                <div className="arg-section">
                  <div className="arg-section-title">Inputs</div>
                  {selectedNode.data.inputs.map((input) => {
                    const conn = getConnectionStatus(selectedNode.id, input, edges, 'in');
                    return (
                      <div key={input} className="arg-field">
                        <div className="arg-field-header">
                          <span className={`arg-socket-dot ${conn.connected ? 'connected' : ''}`} />
                          <span className="arg-field-name">{input}</span>
                          <span className="arg-field-type">input</span>
                        </div>
                        {conn.connected ? (
                          <div className="arg-field-connected">
                            Connected from <strong>{conn.connectedTo}</strong>
                          </div>
                        ) : (
                          <div className="arg-field-disconnected">Not connected</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Output Sockets */}
              {selectedNode.data.outputs.length > 0 && (
                <div className="arg-section">
                  <div className="arg-section-title">Outputs</div>
                  {selectedNode.data.outputs.map((output) => {
                    const conn = getConnectionStatus(selectedNode.id, output, edges, 'out');
                    return (
                      <div key={output} className="arg-field">
                        <div className="arg-field-header">
                          <span className={`arg-socket-dot ${conn.connected ? 'connected' : ''}`} />
                          <span className="arg-field-name">{output}</span>
                          <span className="arg-field-type">output</span>
                        </div>
                        {conn.connected ? (
                          <div className="arg-field-connected">
                            Connected to <strong>{conn.connectedTo}</strong>
                          </div>
                        ) : (
                          <div className="arg-field-disconnected">Not connected</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Variable Node: Value */}
              {selectedNode.data.kind === 'variable' && (
                <div className="arg-section">
                  <div className="arg-section-title">Configuration</div>
                  <div className="arg-field">
                    <div className="arg-field-header">
                      <span className="arg-field-name">Value</span>
                      <span className="arg-field-type">{selectedNode.data.variableType || 'text'}</span>
                    </div>
                    <textarea
                      className="arg-field-input"
                      value={selectedNode.data.value || ''}
                      placeholder="example.com"
                      rows={3}
                      onChange={(e) => onUpdateNodeData(selectedNode.id, { value: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* Tool Node: Parameters */}
              {selectedNode.data.kind === 'tool' && selectedTool && (
                <div className="arg-section">
                  <div className="arg-section-title">Tool Configuration</div>
                  <div className="arg-field">
                    <div className="arg-field-header">
                      <span className="arg-field-name">Command</span>
                      <span className="arg-field-type">template</span>
                    </div>
                    <pre className="arg-field-code">{(selectedTool.command || []).join(' ') || 'No command configured.'}</pre>
                  </div>
                  <div className="arg-field">
                    <div className="arg-field-header">
                      <span className="arg-field-name">Timeout</span>
                      <span className="arg-field-type">seconds</span>
                    </div>
                    <div className="arg-field-value">{selectedTool.timeout_seconds || 300}s</div>
                  </div>
                  {selectedTool.description && (
                    <div className="arg-field">
                      <div className="arg-field-header">
                        <span className="arg-field-name">Description</span>
                      </div>
                      <div className="arg-field-desc">{selectedTool.description}</div>
                    </div>
                  )}

                  {/* Custom parameters */}
                  <div className="arg-section-title">Parameters</div>
                  {Object.entries(selectedNode.data.params || {}).map(([key, val]) => (
                    <div key={key} className="arg-field">
                      <div className="arg-field-header">
                        <span className="arg-field-name">{key}</span>
                        <button
                          className="arg-field-remove"
                          onClick={() => {
                            const next = { ...(selectedNode.data.params || {}) };
                            delete next[key];
                            onUpdateNodeData(selectedNode.id, { params: next });
                          }}
                        >
                          &times;
                        </button>
                      </div>
                      <input
                        className="arg-field-input"
                        value={val}
                        onChange={(e) =>
                          onUpdateNodeData(selectedNode.id, {
                            params: { ...(selectedNode.data.params || {}), [key]: e.target.value },
                          })
                        }
                      />
                    </div>
                  ))}
                  <AddParamButton
                    onAdd={(key, val) =>
                      onUpdateNodeData(selectedNode.id, {
                        params: { ...(selectedNode.data.params || {}), [key]: val },
                      })
                    }
                  />

                  {/* Parameter Presets */}
                  <div className="arg-section-title">Presets</div>
                  {presets.length > 0 ? (
                    presets.map((preset) => (
                      <div key={preset.id} className="arg-field" style={{ cursor: 'pointer' }}>
                        <div className="arg-field-header">
                          <span className="arg-field-name">{preset.name}</span>
                          <button
                            className="arg-field-remove"
                            onClick={(e) => { e.stopPropagation(); deletePreset(preset.id).then(() => fetchPresets(selectedNode.data.toolId!).then(setPresets)); }}
                          >
                            &times;
                          </button>
                        </div>
                        <div
                          className="arg-field-desc"
                          style={{ cursor: 'pointer' }}
                          onClick={() => onUpdateNodeData(selectedNode.id, { params: { ...preset.params } })}
                        >
                          {Object.entries(preset.params).map(([k, v]) => `${k}=${v}`).join(', ') || 'No params'}
                          <br /><span style={{ color: '#5bdcff', fontSize: 11 }}>Click to apply</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="arg-field-desc" style={{ padding: '4px 0' }}>No saved presets for this tool.</div>
                  )}
                  <button
                    className="arg-add-param"
                    onClick={() => {
                      const name = prompt('Preset name:', `${selectedTool?.name || ''} preset`);
                      if (!name || !selectedNode.data.toolId) return;
                      savePreset({ tool_id: selectedNode.data.toolId, name, params: selectedNode.data.params || {} })
                        .then(() => fetchPresets(selectedNode.data.toolId!).then(setPresets));
                    }}
                  >
                    + Save Current as Preset
                  </button>
                </div>
              )}

              {/* Script Node: Language & Body */}
              {selectedNode.data.kind === 'script' && (
                <div className="arg-section">
                  <div className="arg-section-title">Script Configuration</div>
                  <div className="arg-field">
                    <div className="arg-field-header">
                      <span className="arg-field-name">Language</span>
                    </div>
                    <div className="arg-field-toggle-group">
                      <button
                        className={`arg-toggle ${selectedNode.data.scriptLanguage === 'bash' ? 'active' : ''}`}
                        onClick={() => onUpdateNodeData(selectedNode.id, { scriptLanguage: 'bash', label: 'Bash Script' })}
                      >
                        Bash
                      </button>
                      <button
                        className={`arg-toggle ${selectedNode.data.scriptLanguage === 'python' ? 'active' : ''}`}
                        onClick={() => onUpdateNodeData(selectedNode.id, { scriptLanguage: 'python', label: 'Python Script' })}
                      >
                        Python
                      </button>
                    </div>
                  </div>
                  <div className="arg-field">
                    <div className="arg-field-header">
                      <span className="arg-field-name">Script Body</span>
                      <span className="arg-field-type">{selectedNode.data.scriptLanguage || 'bash'}</span>
                    </div>
                    <textarea
                      className="arg-field-input script-editor"
                      value={selectedNode.data.scriptBody || ''}
                      placeholder={selectedNode.data.scriptLanguage === 'python' ? '# Python script...' : '#!/bin/bash\n# Script...'}
                      onChange={(e) => onUpdateNodeData(selectedNode.id, { scriptBody: e.target.value })}
                      spellCheck={false}
                      rows={10}
                    />
                  </div>
                </div>
              )}

              {/* Condition Node */}
              {selectedNode.data.kind === 'condition' && (
                <div className="arg-section">
                  <div className="arg-section-title">Condition Configuration</div>
                  <div className="arg-field">
                    <div className="arg-field-header">
                      <span className="arg-field-name">Expression</span>
                      <span className="arg-field-type">condition</span>
                    </div>
                    <input
                      className="arg-field-input"
                      value={selectedNode.data.conditionExpr || ''}
                      placeholder="has_lines"
                      onChange={(e) => onUpdateNodeData(selectedNode.id, { conditionExpr: e.target.value })}
                    />
                    <div className="arg-field-desc">
                      Supported: <code>has_lines</code>, <code>empty</code>, <code>contains:PATTERN</code>, <code>not_contains:PATTERN</code>, <code>line_count {'>'} N</code>, <code>min_lines:N</code>
                    </div>
                  </div>
                  <div className="arg-field">
                    <div className="arg-field-header">
                      <span className="arg-field-name">Behavior</span>
                    </div>
                    <div className="arg-field-desc">
                      Data flows to the <strong style={{ color: '#43d9ad' }}>pass</strong> output if condition is true, or <strong style={{ color: '#ffabab' }}>fail</strong> output if false.
                    </div>
                  </div>
                </div>
              )}

              {/* Loop Node */}
              {selectedNode.data.kind === 'loop' && (
                <div className="arg-section">
                  <div className="arg-section-title">Iterator Configuration</div>
                  <div className="arg-field">
                    <div className="arg-field-header">
                      <span className="arg-field-name">Mode</span>
                    </div>
                    <div className="arg-field-toggle-group">
                      <button
                        className={`arg-toggle ${(selectedNode.data.loopMode || 'line') === 'line' ? 'active' : ''}`}
                        onClick={() => onUpdateNodeData(selectedNode.id, { loopMode: 'line' })}
                      >
                        Per Line
                      </button>
                      <button
                        className={`arg-toggle ${selectedNode.data.loopMode === 'chunk' ? 'active' : ''}`}
                        onClick={() => onUpdateNodeData(selectedNode.id, { loopMode: 'chunk' })}
                      >
                        Per Chunk
                      </button>
                    </div>
                    <div className="arg-field-desc">
                      <strong>Per Line:</strong> Splits input by newlines, emits each line.<br />
                      <strong>Per Chunk:</strong> Splits by blank lines (double newline).
                    </div>
                  </div>
                </div>
              )}

              {/* Module Node */}
              {selectedNode.data.kind === 'module' && (
                <div className="arg-section">
                  <div className="arg-section-title">Module Configuration</div>
                  <div className="arg-field">
                    <div className="arg-field-header">
                      <span className="arg-field-name">Workflow Reference</span>
                      <span className="arg-field-type">module</span>
                    </div>
                    <div className="arg-field-value mono">{selectedNode.data.moduleWorkflowId || 'none'}</div>
                    <div className="arg-field-desc">Executes the referenced workflow as a nested sub-graph, piping upstream data into its variable nodes.</div>
                  </div>
                </div>
              )}

              {/* Replay Info */}
              {selectedReplay && (
                <div className="arg-section">
                  <div className="arg-section-title">Latest Replay</div>
                  <div className="arg-field">
                    <div className="arg-field-header">
                      <span className="arg-field-name">{selectedReplay.id}</span>
                    </div>
                    <div className="arg-field-desc">
                      Cached parents: {selectedReplay.used_cached_upstream_from.join(', ') || 'none'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Output Tab ── */}
          {activeTab === 'output' && (
            <div className="arg-panel-body">
              {/* Run results for this node */}
              {selectedRunNode ? (
                <div className="arg-section">
                  <div className="arg-section-title">Execution Result</div>
                  <div className="arg-field">
                    <div className="arg-field-header">
                      <span className="arg-field-name">Status</span>
                      <span className={`arg-status-badge ${selectedRunNode.status}`}>{selectedRunNode.status}</span>
                    </div>
                  </div>
                  {selectedRunNode.command?.length > 0 && (
                    <div className="arg-field">
                      <div className="arg-field-header">
                        <span className="arg-field-name">Command</span>
                      </div>
                      <pre className="arg-field-code">{selectedRunNode.command.join(' ')}</pre>
                    </div>
                  )}
                  {selectedRunNode.exit_code !== null && (
                    <div className="arg-field">
                      <div className="arg-field-header">
                        <span className="arg-field-name">Exit Code</span>
                        <span className="arg-field-type">{selectedRunNode.exit_code}</span>
                      </div>
                    </div>
                  )}
                  {selectedRunNode.stdout_preview && (
                    <div className="arg-field">
                      <div className="arg-field-header"><span className="arg-field-name">stdout</span></div>
                      <pre className="arg-field-code stdout">{selectedRunNode.stdout_preview}</pre>
                    </div>
                  )}
                  {selectedRunNode.stderr_preview && (
                    <div className="arg-field">
                      <div className="arg-field-header"><span className="arg-field-name">stderr</span></div>
                      <pre className="arg-field-code stderr">{selectedRunNode.stderr_preview}</pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-state compact">No output yet. Run the workflow to see results.</div>
              )}

              {/* Artifacts for this node */}
              {artifactItems.filter((a) => a.node_id === selectedNode.id).length > 0 && (
                <div className="arg-section">
                  <div className="arg-section-title">Artifacts</div>
                  {artifactItems.filter((a) => a.node_id === selectedNode.id).map((item) => (
                    <button
                      key={item.id}
                      className={`arg-artifact-item ${selectedArtifactPath === item.path ? 'selected' : ''}`}
                      onClick={() => onSelectArtifact(item.path)}
                    >
                      <strong>{item.name}</strong>
                      <span>{item.size_bytes} bytes &middot; {item.extension}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Artifact Preview */}
              {selectedArtifact && (
                <div className="arg-section">
                  <div className="arg-section-title">
                    Preview: {selectedArtifact.name}
                    {rawUrl && (
                      <span className="arg-section-actions">
                        <a className="action-link small" href={rawUrl} target="_blank" rel="noreferrer">Open</a>
                        <a className="action-link small" href={rawUrl} download={selectedArtifact.name}>Download</a>
                      </span>
                    )}
                  </div>
                  <div className="arg-preview-body">
                    {renderPreview(lastRun, selectedArtifact, artifactLoading, artifactPreview)}
                  </div>
                </div>
              )}

              {/* All artifacts (when no node matches) */}
              {artifactItems.filter((a) => a.node_id === selectedNode.id).length === 0 && artifactItems.length > 0 && (
                <div className="arg-section">
                  <div className="arg-section-title">All Artifacts</div>
                  {artifactItems.map((item) => (
                    <button
                      key={item.id}
                      className={`arg-artifact-item ${selectedArtifactPath === item.path ? 'selected' : ''}`}
                      onClick={() => onSelectArtifact(item.path)}
                    >
                      <strong>{item.name}</strong>
                      <span>{item.node_id} &middot; {item.size_bytes} bytes</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Versions Tab ── */}
          {activeTab === 'versions' && (
            <div className="arg-panel-body">
              {versions.length > 0 ? (
                <div className="arg-section">
                  <div className="arg-section-title">Saved Versions</div>
                  {versions.map((v) => (
                    <div key={v.version} className="version-item">
                      <div className="version-info">
                        <strong>v{v.version}</strong>
                        <span>{v.name} &middot; {v.node_count} nodes, {v.edge_count} edges</span>
                        <span className="path-line">{v.updated_at ? new Date(v.updated_at).toLocaleString() : ''}</span>
                      </div>
                      {onRestoreVersion && currentWorkflowId && (
                        <button
                          className="action-btn small"
                          onClick={() => {
                            restoreWorkflowVersion(currentWorkflowId, v.version)
                              .then((wf) => onRestoreVersion(wf))
                              .catch(() => {});
                          }}
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state compact">Save the workflow to start tracking versions.</div>
              )}

              {/* Last run summary */}
              {lastRun && (
                <div className="arg-section">
                  <div className="arg-section-title">Last Run</div>
                  <div className="arg-field">
                    <div className="arg-field-header">
                      <span className="arg-field-name">{lastRun.name}</span>
                      <span className={`arg-status-badge ${lastRun.status}`}>{lastRun.status}</span>
                    </div>
                  </div>
                  <div className="arg-field">
                    <div className="arg-field-header"><span className="arg-field-name">Nodes</span></div>
                    <div className="arg-run-states">
                      {Object.entries(lastRun.node_states).map(([id, state]) => (
                        <div key={id} className="arg-run-state-row">
                          <span className={`arg-socket-dot ${state === 'success' ? 'connected' : ''}`} />
                          <span>{id}</span>
                          <span className={`arg-status-badge tiny ${state}`}>{state}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="arg-panel-empty">
          <div className="arg-panel-empty-icon">&#9881;</div>
          <div className="arg-panel-empty-title">Node Arguments</div>
          <div className="arg-panel-empty-text">Select a node on the canvas to configure its arguments, view connections, and inspect outputs.</div>
        </div>
      )}
    </aside>
  );
}

/* ── Add Parameter Widget ── */

function AddParamButton({ onAdd }: { onAdd: (key: string, val: string) => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [val, setVal] = useState('');

  if (!open) {
    return (
      <button className="arg-add-param" onClick={() => setOpen(true)}>
        + Add Parameter
      </button>
    );
  }

  return (
    <div className="arg-add-param-form">
      <input className="arg-field-input" placeholder="Key" value={key} onChange={(e) => setKey(e.target.value)} />
      <input className="arg-field-input" placeholder="Value" value={val} onChange={(e) => setVal(e.target.value)} />
      <div className="arg-add-param-actions">
        <button
          className="action-btn small"
          disabled={!key.trim()}
          onClick={() => { onAdd(key.trim(), val); setKey(''); setVal(''); setOpen(false); }}
        >
          Add
        </button>
        <button className="action-btn small" onClick={() => { setOpen(false); setKey(''); setVal(''); }}>Cancel</button>
      </div>
    </div>
  );
}

/* ── Helpers ── */

function getCategoryStyle(node: FlowNode): React.CSSProperties {
  const d = node.data as WorkflowNodePayload;
  if (d.kind === 'condition') return { background: '#ff9f4322', color: '#ff9f43' };
  if (d.kind === 'loop') return { background: '#ffcf5b22', color: '#ffcf5b' };
  if (d.kind === 'module') return { background: '#b47cff22', color: '#b47cff' };
  if (d.kind === 'script') return { background: d.scriptLanguage === 'python' ? '#ffcf5b22' : '#43d9ad22', color: d.scriptLanguage === 'python' ? '#ffcf5b' : '#43d9ad' };
  if (d.kind === 'variable') return { background: '#43d9ad22', color: '#43d9ad' };
  if (d.kind === 'output') return { background: '#ff9f4322', color: '#ff9f43' };
  const catColor = d.category ? CATEGORY_COLORS[d.category] || '#5bdcff' : '#5bdcff';
  return { background: `${catColor}22`, color: catColor };
}

function getCategoryIcon(node: FlowNode): string {
  const d = node.data as WorkflowNodePayload;
  if (d.kind === 'condition') return '\u{2696}';
  if (d.kind === 'loop') return '\u{1F504}';
  if (d.kind === 'module') return '\u{1F9E9}';
  if (d.kind === 'script') return d.scriptLanguage === 'python' ? '\u{1F40D}' : '\u{1F4DC}';
  if (d.kind === 'variable') return '\u{1F4E5}';
  if (d.kind === 'output') return '\u{1F4E4}';
  return d.category ? CATEGORY_ICONS[d.category] || '\u{1F527}' : '\u{1F527}';
}

function getKindLabel(node: FlowNode): string {
  const d = node.data as WorkflowNodePayload;
  if (d.kind === 'tool') return d.category ? `${d.category} Tool` : 'Tool';
  if (d.kind === 'script') return `${d.scriptLanguage === 'python' ? 'Python' : 'Bash'} Script`;
  if (d.kind === 'module') return 'Sub-Workflow Module';
  if (d.kind === 'condition') return 'Conditional Branch';
  if (d.kind === 'loop') return `Iterator (${d.loopMode || 'line'})`;
  return d.kind.charAt(0).toUpperCase() + d.kind.slice(1);
}

function renderPreview(lastRun: RunRecord | null, selectedArtifact: ArtifactItem | null, loading: boolean, preview: ArtifactPreview | null) {
  if (!lastRun) return <div className="empty-state compact">Run a workflow to browse artifacts here.</div>;
  if (!selectedArtifact) return <div className="empty-state compact">Select an artifact to preview it.</div>;
  if (loading) return <div className="empty-state compact">Loading artifact preview...</div>;
  if (!preview) return <div className="empty-state compact">Preview unavailable.</div>;
  if (!preview.ok) return <div className="empty-state compact">{preview.error}</div>;

  if (preview.kind === 'image') {
    return <img className="artifact-preview-image" src={preview.image_data_url} alt={preview.name} style={{ maxWidth: '100%', borderRadius: 8 }} />;
  }
  if (preview.kind === 'json') {
    return <pre className="arg-field-code">{JSON.stringify(preview.json_content, null, 2)}</pre>;
  }
  if (preview.kind === 'html') {
    return <iframe className="artifact-preview-frame" sandbox="" srcDoc={preview.html_content} title={preview.name} />;
  }
  if (preview.kind === 'text') {
    return <pre className="arg-field-code">{preview.text_content}</pre>;
  }
  return (
    <div className="arg-field-desc">
      No inline preview for this file type. ({preview.mime_type})
    </div>
  );
}
