import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { FlowNode, Tool, ToolArg, RunRecord, ReplayRecord, ArtifactItem, ArtifactPreview, WorkflowNodePayload, WorkflowVersion } from '../../types';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../../types';
import { artifactRawUrl, fetchWorkflowVersions, restoreWorkflowVersion, fetchPresets, savePreset, deletePreset, type Preset } from '../../api';
import type { Edge } from '@xyflow/react';

/** Color map for socket data types (matches SocketNode) */
const SOCKET_COLORS: Record<string, string> = {
  domain: '#5b8cff',
  targets: '#43d9ad',
  wordlist: '#ffcf5b',
  findings: '#ff5b6c',
  any: '#b47cff',
  pass: '#43d9ad',
  fail: '#ff5b6c',
  item: '#ffcf5b',
};

function socketColor(name: string): string {
  return SOCKET_COLORS[name] || '#63e6ff';
}

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

  useEffect(() => {
    setActiveTab('arguments');
  }, [selectedNode?.id]);

  /** Toggle a tool arg on/off in the node params */
  function toggleArg(arg: ToolArg) {
    if (!selectedNode) return;
    const params = { ...(selectedNode.data.params || {}) };
    if (arg.flag in params) {
      // Turn off — remove from params
      delete params[arg.flag];
    } else {
      // Turn on — set to default or empty
      if (arg.type === 'flag') {
        params[arg.flag] = '__flag__'; // sentinel: flag is enabled, no value needed
      } else {
        params[arg.flag] = arg.default || '';
      }
    }
    onUpdateNodeData(selectedNode.id, { params });
  }

  /** Update value for a toggled-on arg */
  function updateArgValue(flag: string, value: string) {
    if (!selectedNode) return;
    onUpdateNodeData(selectedNode.id, {
      params: { ...(selectedNode.data.params || {}), [flag]: value },
    });
  }

  return (
    <aside className="sidebar right">
      {selectedNode ? (
        <>
          {/* ── Node Header ── */}
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
            <button className={`arg-tab ${activeTab === 'arguments' ? 'active' : ''}`} onClick={() => setActiveTab('arguments')}>
              Arguments
            </button>
            <button className={`arg-tab ${activeTab === 'output' ? 'active' : ''}`} onClick={() => setActiveTab('output')}>
              Output
            </button>
            {versions.length > 0 && (
              <button className={`arg-tab ${activeTab === 'versions' ? 'active' : ''}`} onClick={() => setActiveTab('versions')}>
                History ({versions.length})
              </button>
            )}
          </div>

          {/* ── Arguments Tab ── */}
          {activeTab === 'arguments' && (
            <div className="arg-panel-body">

              {/* ── Input Sockets (Trickest style) ── */}
              {selectedNode.data.inputs.length > 0 && (
                <div className="arg-section">
                  <div className="arg-section-title">Inputs</div>
                  {selectedNode.data.inputs.map((input) => {
                    const conn = getConnectionStatus(selectedNode.id, input, edges, 'in');
                    const color = socketColor(input);
                    return (
                      <div key={input} className="arg-socket-field">
                        <div className="arg-socket-field-row">
                          <span className="arg-socket-indicator" style={{ background: conn.connected ? color : 'transparent', borderColor: color }} />
                          <span className="arg-socket-name">{input}</span>
                          <span className="arg-socket-type-badge" style={{ color, borderColor: `${color}44` }}>input</span>
                        </div>
                        {conn.connected ? (
                          <div className="arg-socket-connection" style={{ color }}>
                            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M8 5H2M2 5L4.5 2.5M2 5L4.5 7.5" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
                            <span>from <strong>{conn.connectedTo}</strong></span>
                          </div>
                        ) : (
                          <div className="arg-socket-disconnected">Not connected</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Output Sockets (Trickest style) ── */}
              {selectedNode.data.outputs.length > 0 && (
                <div className="arg-section">
                  <div className="arg-section-title">Outputs</div>
                  {selectedNode.data.outputs.map((output) => {
                    const conn = getConnectionStatus(selectedNode.id, output, edges, 'out');
                    const color = socketColor(output);
                    return (
                      <div key={output} className="arg-socket-field">
                        <div className="arg-socket-field-row">
                          <span className="arg-socket-indicator" style={{ background: conn.connected ? color : 'transparent', borderColor: color }} />
                          <span className="arg-socket-name">{output}</span>
                          <span className="arg-socket-type-badge" style={{ color, borderColor: `${color}44` }}>output</span>
                        </div>
                        {conn.connected ? (
                          <div className="arg-socket-connection" style={{ color }}>
                            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5H8M8 5L5.5 2.5M8 5L5.5 7.5" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
                            <span>to <strong>{conn.connectedTo}</strong></span>
                          </div>
                        ) : (
                          <div className="arg-socket-disconnected">Not connected</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Variable Node: Value ── */}
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

              {/* ── Tool Node: Argument Switches ── */}
              {selectedNode.data.kind === 'tool' && selectedTool && (
                <div className="arg-section">
                  <div className="arg-section-title">
                    Arguments
                    {selectedTool.args && selectedTool.args.length > 0 && (
                      <span className="arg-count-badge">
                        {Object.keys(selectedNode.data.params || {}).length}/{selectedTool.args.length}
                      </span>
                    )}
                  </div>

                  {/* Tool description */}
                  {selectedTool.description && (
                    <div className="arg-tool-desc">{selectedTool.description}</div>
                  )}

                  {/* Command preview */}
                  <div className="arg-command-preview">
                    <pre>{buildCommandPreview(selectedTool, selectedNode.data.params || {})}</pre>
                  </div>

                  {/* Argument switches */}
                  {selectedTool.args && selectedTool.args.length > 0 ? (
                    <div className="arg-switches-list">
                      {selectedTool.args.map((arg) => {
                        const isOn = arg.flag in (selectedNode.data.params || {});
                        const currentValue = (selectedNode.data.params || {})[arg.flag];
                        const isFlag = arg.type === 'flag';

                        return (
                          <div key={arg.flag} className={`arg-switch-item ${isOn ? 'active' : ''}`}>
                            <div className="arg-switch-row">
                              <button
                                className={`arg-switch-toggle ${isOn ? 'on' : 'off'}`}
                                onClick={() => toggleArg(arg)}
                                title={isOn ? 'Disable' : 'Enable'}
                              >
                                <span className="arg-switch-track">
                                  <span className="arg-switch-thumb" />
                                </span>
                              </button>
                              <div className="arg-switch-info">
                                <span className="arg-switch-label">{arg.label}</span>
                                <code className="arg-switch-flag">{arg.flag}</code>
                              </div>
                              {!isFlag && (
                                <span className="arg-switch-type-tag">{arg.type}</span>
                              )}
                            </div>

                            {/* Value input for non-flag args when toggled on */}
                            {isOn && !isFlag && (
                              <div className="arg-switch-value">
                                <input
                                  className="arg-switch-input"
                                  type={arg.type === 'int' || arg.type === 'float' ? 'number' : 'text'}
                                  value={currentValue || ''}
                                  placeholder={arg.default || arg.type}
                                  onChange={(e) => updateArgValue(arg.flag, e.target.value)}
                                />
                              </div>
                            )}

                            {/* Description tooltip */}
                            {arg.description && (
                              <div className="arg-switch-desc">{arg.description}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="arg-field-desc" style={{ padding: '8px 0' }}>No configurable arguments for this tool.</div>
                  )}

                  {/* Custom extra parameters (for anything not in the defined args) */}
                  {(() => {
                    const definedFlags = new Set((selectedTool.args || []).map((a) => a.flag));
                    const customParams = Object.entries(selectedNode.data.params || {}).filter(([k]) => !definedFlags.has(k));
                    if (customParams.length === 0) return null;
                    return (
                      <>
                        <div className="arg-section-title">Custom Parameters</div>
                        {customParams.map(([key, val]) => (
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
                      </>
                    );
                  })()}

                  <AddParamButton
                    onAdd={(key, val) =>
                      onUpdateNodeData(selectedNode.id, {
                        params: { ...(selectedNode.data.params || {}), [key]: val },
                      })
                    }
                  />

                  {/* Presets */}
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
                    <div className="script-editor-monaco" style={{ border: '1px solid #1a2744', borderRadius: 4, overflow: 'hidden' }}>
                      <Editor
                        height="240px"
                        theme="vs-dark"
                        language={selectedNode.data.scriptLanguage === 'python' ? 'python' : 'shell'}
                        value={selectedNode.data.scriptBody || ''}
                        onChange={(val) => onUpdateNodeData(selectedNode.id, { scriptBody: val || '' })}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 12,
                          tabSize: 2,
                          scrollBeyondLastLine: false,
                          lineNumbers: 'on',
                          renderLineHighlight: 'line',
                          automaticLayout: true,
                          wordWrap: 'on',
                        }}
                      />
                    </div>
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
                      <div className="arg-field-header"><span className="arg-field-name">Command</span></div>
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

/* ── Build Command Preview ── */

function buildCommandPreview(tool: Tool, params: Record<string, string>): string {
  const base = (tool.command || []).join(' ');
  const extras: string[] = [];
  for (const [flag, val] of Object.entries(params)) {
    if (val === '__flag__') {
      extras.push(flag);
    } else {
      extras.push(`${flag} ${val}`);
    }
  }
  return extras.length > 0 ? `${base} ${extras.join(' ')}` : base;
}

/* ── Add Parameter Widget ── */

function AddParamButton({ onAdd }: { onAdd: (key: string, val: string) => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [val, setVal] = useState('');

  if (!open) {
    return (
      <button className="arg-add-param" onClick={() => setOpen(true)}>
        + Add Custom Parameter
      </button>
    );
  }

  return (
    <div className="arg-add-param-form">
      <input className="arg-field-input" placeholder="Flag (e.g. -H)" value={key} onChange={(e) => setKey(e.target.value)} />
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
