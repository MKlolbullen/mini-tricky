import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';

type Tool = {
  id: string;
  name: string;
  category: string;
  inputs: string[];
  outputs: string[];
  command?: string[];
  timeout_seconds?: number;
};

type Health = { status: string };

type WorkflowNodePayload = {
  kind: 'tool' | 'variable' | 'output';
  label: string;
  toolId?: string;
  variableType?: string;
  inputs: string[];
  outputs: string[];
  value?: string;
  params?: Record<string, string>;
  runState?: string;
};

type WorkflowRecord = {
  id: string;
  name: string;
  graph: {
    nodes: Array<{
      id: string;
      kind: 'tool' | 'variable' | 'output';
      label: string;
      tool_id?: string | null;
      variable_type?: string | null;
      value?: string | null;
      params?: Record<string, string> | null;
      position?: { x: number; y: number };
    }>;
    edges: Array<{
      id?: string;
      source: string;
      target: string;
      source_handle?: string | null;
      target_handle?: string | null;
    }>;
  };
};

type NodeRunResult = {
  node_id: string;
  status: string;
  command: string[];
  exit_code: number | null;
  artifact_paths: string[];
  outputs: Record<string, string>;
  stdout_preview: string;
  stderr_preview: string;
  stdout_path: string;
  stderr_path: string;
  logs: string[];
};

type ReplayRecord = {
  id: string;
  node_id: string;
  created_at: string;
  used_cached_upstream_from: string[];
  result: NodeRunResult;
};

type ReplayResponse = {
  ok: boolean;
  run_id: string;
  replay_id: string;
  node_id: string;
  parent_ids: string[];
  cached_output_nodes: string[];
  result: NodeRunResult;
  error?: string;
};

type RunRecord = {
  id: string;
  workflow_id: string | null;
  name: string;
  status: string;
  parallel_groups: string[][];
  node_states: Record<string, string>;
  node_results: Record<string, NodeRunResult>;
  artifact_root: string;
  replays?: ReplayRecord[];
  logs: string[];
};

const apiBase = (window as any).miniTrickyDesktop?.apiBase || 'http://127.0.0.1:5000';
const variableCatalog = [
  { label: 'Domain Input', type: 'domain' },
  { label: 'Target List', type: 'targets' },
  { label: 'Wordlist', type: 'wordlist' },
];
const outputCatalog = [{ label: 'Artifacts', type: 'any' }];

function SocketNode({ data, selected }: NodeProps<Node<WorkflowNodePayload>>) {
  const payload = data as WorkflowNodePayload;
  const stateClass = payload.runState ? `state-${payload.runState}` : '';
  return (
    <div className={`flow-node ${payload.kind} ${stateClass} ${selected ? 'selected' : ''}`}>
      <div className="flow-node-header">
        <span>{payload.label}</span>
        <small>{payload.kind === 'tool' ? payload.toolId : payload.kind}</small>
      </div>

      {payload.runState && <div className={`node-state-pill ${payload.runState}`}>{payload.runState}</div>}

      {payload.inputs.length > 0 && (
        <div className="socket-list left">
          {payload.inputs.map((input, index) => (
            <div key={input} className="socket-row left" style={{ top: 52 + index * 26 }}>
              <Handle type="target" position={Position.Left} id={`in:${input}`} />
              <span>{input}</span>
            </div>
          ))}
        </div>
      )}

      {payload.outputs.length > 0 && (
        <div className="socket-list right">
          {payload.outputs.map((output, index) => (
            <div key={output} className="socket-row right" style={{ top: 52 + index * 26 }}>
              <span>{output}</span>
              <Handle type="source" position={Position.Right} id={`out:${output}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const nodeTypes = {
  socketNode: SocketNode,
};

const initialNodes: Node<WorkflowNodePayload>[] = [
  {
    id: 'variable-1',
    position: { x: 80, y: 120 },
    type: 'socketNode',
    data: { kind: 'variable', label: 'Domain Input', variableType: 'domain', value: '', params: {}, inputs: [], outputs: ['domain'] },
  },
  {
    id: 'tool-1',
    position: { x: 360, y: 120 },
    type: 'socketNode',
    data: { kind: 'tool', label: 'Subfinder', toolId: 'subfinder', params: {}, inputs: ['domain'], outputs: ['targets'] },
  },
  {
    id: 'tool-2',
    position: { x: 660, y: 120 },
    type: 'socketNode',
    data: { kind: 'tool', label: 'HTTPX', toolId: 'httpx', params: {}, inputs: ['targets'], outputs: ['targets'] },
  },
  {
    id: 'tool-3',
    position: { x: 960, y: 120 },
    type: 'socketNode',
    data: { kind: 'tool', label: 'Nuclei', toolId: 'nuclei', params: {}, inputs: ['targets'], outputs: ['findings'] },
  },
  {
    id: 'output-1',
    position: { x: 1260, y: 120 },
    type: 'socketNode',
    data: { kind: 'output', label: 'Artifacts', params: {}, inputs: ['any'], outputs: [] },
  },
];

const initialEdges: Edge[] = [
  { id: 'e1', source: 'variable-1', sourceHandle: 'out:domain', target: 'tool-1', targetHandle: 'in:domain' },
  { id: 'e2', source: 'tool-1', sourceHandle: 'out:targets', target: 'tool-2', targetHandle: 'in:targets' },
  { id: 'e3', source: 'tool-2', sourceHandle: 'out:targets', target: 'tool-3', targetHandle: 'in:targets' },
  { id: 'e4', source: 'tool-3', sourceHandle: 'out:findings', target: 'output-1', targetHandle: 'in:any' },
];

function formatGraph(nodes: Node<WorkflowNodePayload>[], edges: Edge[]) {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: node.data.kind,
      label: node.data.label,
      tool_id: node.data.toolId ?? null,
      variable_type: node.data.variableType ?? null,
      value: node.data.value ?? null,
      params: node.data.params ?? {},
      position: node.position,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      source_handle: edge.sourceHandle ?? null,
      target_handle: edge.targetHandle ?? null,
    })),
  };
}

function graphToNodes(workflow: WorkflowRecord): Node<WorkflowNodePayload>[] {
  return workflow.graph.nodes.map((node) => ({
    id: node.id,
    position: node.position || { x: 120, y: 120 },
    type: 'socketNode',
    data: {
      kind: node.kind,
      label: node.label,
      toolId: node.tool_id || undefined,
      variableType: node.variable_type || undefined,
      value: node.value || '',
      params: node.params || {},
      inputs: node.kind === 'tool' ? [] : node.kind === 'output' ? ['any'] : [],
      outputs: node.kind === 'variable' ? [node.variable_type || 'targets'] : [],
      runState: undefined,
    },
  }));
}

function hydrateNodesWithTools(nodes: Node<WorkflowNodePayload>[], tools: Tool[]) {
  const byId = new Map(tools.map((tool) => [tool.id, tool]));
  return nodes.map((node) => {
    if (node.data.kind === 'tool' && node.data.toolId && byId.has(node.data.toolId)) {
      const tool = byId.get(node.data.toolId)!;
      return { ...node, data: { ...node.data, label: tool.name, inputs: tool.inputs, outputs: tool.outputs } };
    }
    return node;
  });
}

function graphToEdges(workflow: WorkflowRecord): Edge[] {
  return workflow.graph.edges.map((edge, index) => ({
    id: edge.id || `edge-${index}`,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.source_handle || undefined,
    targetHandle: edge.target_handle || undefined,
  }));
}

function applyRunState(nodes: Node<WorkflowNodePayload>[], nodeStates: Record<string, string>) {
  return nodes.map((node) => ({
    ...node,
    data: { ...node.data, runState: nodeStates[node.id] },
  }));
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [tools, setTools] = useState<Tool[]>([]);
  const [savedWorkflows, setSavedWorkflows] = useState<WorkflowRecord[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [search, setSearch] = useState('');
  const [workflowName, setWorkflowName] = useState('Starter Recon Chain');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [consoleTab, setConsoleTab] = useState<'stdout' | 'stderr' | 'stdin' | 'artifacts'>('stdout');
  const [consoleLines, setConsoleLines] = useState<string[]>([
    '[+] Ready.',
    '[+] Set a variable value, validate socket wiring, or launch a real local run.',
  ]);
  const [lastRun, setLastRun] = useState<RunRecord | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [maxParallel, setMaxParallel] = useState(2);
  const counterRef = useRef(20);

  useEffect(() => {
    fetch(`${apiBase}/api/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ status: 'offline' }));

    fetch(`${apiBase}/api/tools`)
      .then((r) => r.json())
      .then((loadedTools: Tool[]) => {
        setTools(loadedTools);
        setNodes(hydrateNodesWithTools(initialNodes, loadedTools));
      })
      .catch(() => setTools([]));

    refreshWorkflows();
  }, [setNodes]);

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const selectedRunNode = useMemo(() => {
    if (!selectedNodeId || !lastRun?.node_results) return null;
    return lastRun.node_results[selectedNodeId] || null;
  }, [selectedNodeId, lastRun]);

  const selectedReplay = useMemo(() => {
    if (!selectedNodeId || !lastRun?.replays?.length) return null;
    return lastRun.replays.find((replay) => replay.node_id === selectedNodeId) || null;
  }, [selectedNodeId, lastRun]);

  const filteredTools = useMemo(() => {
    return tools.filter((tool) => `${tool.name} ${tool.category}`.toLowerCase().includes(search.toLowerCase()));
  }, [tools, search]);

  function appendConsole(lines: string[]) {
    setConsoleLines(lines);
  }

  async function refreshWorkflows() {
    try {
      const response = await fetch(`${apiBase}/api/workflows`);
      const data = await response.json();
      setSavedWorkflows(data);
    } catch {
      setSavedWorkflows([]);
    }
  }

  function updateNodeData(nodeId: string, patch: Partial<WorkflowNodePayload>) {
    setNodes((current) => current.map((node) => (
      node.id === nodeId
        ? { ...node, data: { ...node.data, ...patch } }
        : node
    )));
  }

  function getNextPosition() {
    counterRef.current += 1;
    const offset = counterRef.current * 24;
    return { x: 140 + (offset % 420), y: 180 + (offset % 260) };
  }

  function addVariableNode(variableType: string, label: string) {
    const id = `variable-${counterRef.current + 1}`;
    setNodes((current) => [
      ...current,
      {
        id,
        position: getNextPosition(),
        type: 'socketNode',
        data: { kind: 'variable', label, variableType, value: '', params: {}, inputs: [], outputs: [variableType] },
      },
    ]);
  }

  function addOutputNode() {
    const id = `output-${counterRef.current + 1}`;
    setNodes((current) => [
      ...current,
      {
        id,
        position: getNextPosition(),
        type: 'socketNode',
        data: { kind: 'output', label: 'Artifacts', params: {}, inputs: ['any'], outputs: [] },
      },
    ]);
  }

  function addToolNode(tool: Tool) {
    const id = `tool-${counterRef.current + 1}`;
    setNodes((current) => [
      ...current,
      {
        id,
        position: getNextPosition(),
        type: 'socketNode',
        data: { kind: 'tool', label: tool.name, toolId: tool.id, params: {}, inputs: tool.inputs, outputs: tool.outputs },
      },
    ]);
  }

  function isCompatibleConnection(connection: Connection) {
    const { source, target, sourceHandle, targetHandle } = connection;
    if (!source || !target || !sourceHandle || !targetHandle) {
      appendConsole(['[-] Missing source/target handle metadata.']);
      return false;
    }

    if (!sourceHandle.startsWith('out:') || !targetHandle.startsWith('in:')) {
      appendConsole(['[-] Invalid handle direction. Only output → input connections are allowed.']);
      return false;
    }

    if (edges.some((edge) => edge.target === target && edge.targetHandle === targetHandle)) {
      appendConsole([`[-] Target socket ${targetHandle} is already occupied.`]);
      return false;
    }

    const sourceType = sourceHandle.slice(4);
    const targetType = targetHandle.slice(3);
    if (targetType !== 'any' && sourceType !== targetType) {
      appendConsole([`[-] Socket type mismatch: ${sourceType} -> ${targetType}`]);
      return false;
    }

    return true;
  }

  const onConnect = (params: Connection) => {
    if (!isCompatibleConnection(params)) {
      return;
    }
    setEdges((current) => addEdge({ ...params, id: `edge-${current.length + 1}` }, current));
    appendConsole([`[+] Connected ${params.sourceHandle} -> ${params.targetHandle}`]);
  };

  async function saveWorkflow() {
    const payload = {
      name: workflowName,
      graph: formatGraph(nodes, edges),
    };

    const response = await fetch(`${apiBase}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    await refreshWorkflows();
    appendConsole([`[+] Saved workflow "${result.name}" (${result.id}).`]);
  }

  async function validateWorkflow() {
    const response = await fetch(`${apiBase}/api/workflows/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formatGraph(nodes, edges)),
    });
    const result = await response.json();
    if (result.ok) {
      appendConsole([
        '[+] Graph validated successfully.',
        `[+] Topological order: ${result.topological_order.join(' -> ')}`,
        `[+] Parallel groups: ${result.parallel_groups.map((group: string[]) => `[${group.join(', ')}]`).join(' ')}`,
      ]);
    } else {
      appendConsole([`[-] Validation failed: ${result.error}`]);
    }
  }

  async function runWorkflow() {
    const response = await fetch(`${apiBase}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: workflowName, workflow: formatGraph(nodes, edges), max_parallel: maxParallel }),
    });
    const result = await response.json();
    setLastRun(result);
    setConsoleTab('stdout');
    if (result.node_states) {
      setNodes((current) => applyRunState(current, result.node_states));
    }
    appendConsole(result.logs || ['[+] Run started.']);
  }

  async function replaySelectedNode() {
    if (!lastRun?.id || !selectedNodeId) {
      appendConsole(['[-] Select a node from a completed run before replaying it.']);
      return;
    }

    setIsReplaying(true);
    try {
      const response = await fetch(`${apiBase}/api/runs/${lastRun.id}/replay/${selectedNodeId}`, {
        method: 'POST',
      });
      const result: ReplayResponse = await response.json();

      if (!result.ok) {
        appendConsole([`[-] Replay failed: ${result.error || 'unknown error'}`]);
        return;
      }

      const refreshed = await fetch(`${apiBase}/api/runs/${lastRun.id}`).then((r) => r.json());
      setLastRun(refreshed);
      setNodes((current) => current.map((node) => (
        node.id === selectedNodeId
          ? { ...node, data: { ...node.data, runState: result.result.status } }
          : node
      )));
      setConsoleTab('stdout');
      appendConsole([
        `[+] Replay ${result.replay_id} completed for ${selectedNodeId}.`,
        ...result.result.logs,
      ]);
    } catch {
      appendConsole(['[-] Replay request failed.']);
    } finally {
      setIsReplaying(false);
    }
  }

  function loadWorkflow(workflow: WorkflowRecord) {
    setWorkflowName(workflow.name);
    const hydrated = hydrateNodesWithTools(graphToNodes(workflow), tools);
    setNodes(hydrateNodesWithTools(hydrated, tools));
    setEdges(graphToEdges(workflow));
    setSelectedNodeId(null);
    setLastRun(null);
    appendConsole([`[+] Loaded workflow "${workflow.name}".`]);
  }

  function selectedToolDefinition() {
    if (!selectedNode?.data.toolId) return null;
    return tools.find((tool) => tool.id === selectedNode.data.toolId) || null;
  }

  const selectedTool = selectedToolDefinition();

  const stdoutView = selectedReplay?.result.stdout_preview || selectedRunNode?.stdout_preview || consoleLines.join('\n');
  const stderrView = selectedReplay?.result.stderr_preview || selectedRunNode?.stderr_preview || '[-] No stderr captured for the selected node.';
  const artifactsView = selectedReplay
    ? (selectedReplay.result.artifact_paths.join('\n') || '[+] No replay artifacts produced for the selected node.')
    : selectedRunNode
      ? (selectedRunNode.artifact_paths.join('\n') || '[+] No artifacts produced for the selected node.')
      : (lastRun ? lastRun.logs.filter((line) => line.includes('artifact://')).join('\n') || '[+] No artifact paths emitted yet.' : '[+] No completed run yet.');

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">mini-tricky</div>
        <nav>
          <button className="nav-btn active">Builder</button>
          <button className="nav-btn">Templates</button>
          <button className="nav-btn">Runs</button>
          <button className="nav-btn">Settings</button>
        </nav>
        <div className={`status-pill ${health?.status === 'ok' ? 'ok' : 'warn'}`}>API: {health?.status || 'checking'}</div>
      </header>

      <div className="toolbar">
        <input
          className="name-input"
          value={workflowName}
          onChange={(event) => setWorkflowName(event.target.value)}
          placeholder="Workflow name"
        />
        <label className="parallel-wrap">
          <span>Workers</span>
          <input
            className="parallel-input"
            type="number"
            min={1}
            max={16}
            value={maxParallel}
            onChange={(event) => setMaxParallel(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>
        <button className="action-btn" onClick={saveWorkflow}>Save Workflow</button>
        <button className="action-btn" onClick={validateWorkflow}>Validate Graph</button>
        <button className="action-btn primary" onClick={runWorkflow}>Run Queue</button>
      </div>

      <div className="workspace">
        <aside className="sidebar left">
          <input className="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tools..." />

          <div className="section-title">Variables</div>
          {variableCatalog.map((variable) => (
            <button
              key={variable.type}
              className="palette-item tool"
              onClick={() => addVariableNode(variable.type, variable.label)}
            >
              <strong>{variable.label}</strong>
              <span>Output: {variable.type}</span>
            </button>
          ))}

          <div className="section-title">Outputs</div>
          {outputCatalog.map((output) => (
            <button key={output.label} className="palette-item tool" onClick={addOutputNode}>
              <strong>{output.label}</strong>
              <span>Input: {output.type}</span>
            </button>
          ))}

          <div className="section-title">Tools</div>
          {filteredTools.map((tool) => (
            <button key={tool.id} className="palette-item tool" onClick={() => addToolNode(tool)}>
              <strong>{tool.name}</strong>
              <span>{tool.category} · {tool.inputs.join(', ') || 'no inputs'}</span>
            </button>
          ))}

          <div className="section-title">Saved Workflows</div>
          {savedWorkflows.length === 0 && <div className="empty-mini">No saved workflows yet.</div>}
          {savedWorkflows.map((workflow) => (
            <button key={workflow.id} className="palette-item tool" onClick={() => loadWorkflow(workflow)}>
              <strong>{workflow.name}</strong>
              <span>{workflow.graph.nodes.length} nodes · {workflow.graph.edges.length} edges</span>
            </button>
          ))}
        </aside>

        <main className="canvas-wrap">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onConnect={onConnect}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </main>

        <aside className="sidebar right">
          <div className="section-title">Inspector</div>
          {selectedNode ? (
            <div className="inspector-card">
              <h3>{selectedNode.data.label}</h3>
              <p>{selectedNode.data.kind === 'tool' ? `Tool: ${selectedNode.data.toolId}` : `Node: ${selectedNode.data.kind}`}</p>

              <div className="meta-block">
                <strong>Inputs</strong>
                <ul>{selectedNode.data.inputs.map((value) => <li key={value}>{value}</li>)}</ul>
              </div>

              <div className="meta-block">
                <strong>Outputs</strong>
                <ul>{selectedNode.data.outputs.map((value) => <li key={value}>{value}</li>)}</ul>
              </div>

              {selectedNode.data.kind === 'variable' && (
                <div className="meta-block">
                  <strong>Value</strong>
                  <textarea
                    className="inspector-textarea"
                    value={selectedNode.data.value || ''}
                    placeholder="example.com"
                    onChange={(event) => updateNodeData(selectedNode.id, { value: event.target.value })}
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

              {selectedNode.data.runState && (
                <div className="meta-block">
                  <strong>Last Run State</strong>
                  <div>{selectedNode.data.runState}</div>
                </div>
              )}

              {lastRun && (
                <div className="meta-block">
                  <strong>Replay</strong>
                  <button className="action-btn" onClick={replaySelectedNode} disabled={isReplaying}>
                    {isReplaying ? 'Replaying...' : `Replay ${selectedNode.id}`}
                  </button>
                  <div className="path-line">Runs the selected node again using cached upstream outputs from the current run.</div>
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
                <ul>{lastRun.parallel_groups.map((group, index) => <li key={index}>[{group.join(', ')}]</li>)}</ul>
              </div>
              <div className="meta-block">
                <strong>Node States</strong>
                <ul>{Object.entries(lastRun.node_states).map(([id, state]) => <li key={id}>{id}: {state}</li>)}</ul>
              </div>
              <div className="meta-block">
                <strong>Replays</strong>
                {lastRun.replays && lastRun.replays.length > 0 ? (
                  <ul>{lastRun.replays.map((replay) => <li key={replay.id}>{replay.id}: {replay.node_id}</li>)}</ul>
                ) : (
                  <div className="path-line">No node replays yet.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state">No runs yet.</div>
          )}
        </aside>
      </div>

      <section className="console">
        <div className="console-tabs">
          {(['stdout', 'stderr', 'stdin', 'artifacts'] as const).map((tab) => (
            <button
              key={tab}
              className={`console-tab ${consoleTab === tab ? 'active' : ''}`}
              onClick={() => setConsoleTab(tab)}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>
        <pre className="console-output">
          {consoleTab === 'stdout' && stdoutView}
          {consoleTab === 'stderr' && stderrView}
          {consoleTab === 'stdin' && '[>] No interactive stdin handling yet. That comes after the basic subprocess runner is stable.'}
          {consoleTab === 'artifacts' && artifactsView}
        </pre>
      </section>
    </div>
  );
}
