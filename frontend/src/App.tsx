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
};

type Health = { status: string };

type WorkflowNodePayload = {
  kind: 'tool' | 'variable' | 'output';
  label: string;
  toolId?: string;
  variableType?: string;
  inputs: string[];
  outputs: string[];
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

type RunRecord = {
  id: string;
  workflow_id: string | null;
  name: string;
  status: string;
  parallel_groups: string[][];
  node_states: Record<string, string>;
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
  return (
    <div className={`flow-node ${payload.kind} ${selected ? 'selected' : ''}`}>
      <div className="flow-node-header">
        <span>{payload.label}</span>
        <small>{payload.kind === 'tool' ? payload.toolId : payload.kind}</small>
      </div>

      {payload.inputs.length > 0 && (
        <div className="socket-list left">
          {payload.inputs.map((input, index) => (
            <div key={input} className="socket-row left" style={{ top: 46 + index * 26 }}>
              <Handle type="target" position={Position.Left} id={`in:${input}`} />
              <span>{input}</span>
            </div>
          ))}
        </div>
      )}

      {payload.outputs.length > 0 && (
        <div className="socket-list right">
          {payload.outputs.map((output, index) => (
            <div key={output} className="socket-row right" style={{ top: 46 + index * 26 }}>
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
    data: { kind: 'variable', label: 'Domain Input', variableType: 'domain', inputs: [], outputs: ['domain'] },
  },
  {
    id: 'tool-1',
    position: { x: 360, y: 120 },
    type: 'socketNode',
    data: { kind: 'tool', label: 'Subfinder', toolId: 'subfinder', inputs: ['domain'], outputs: ['targets'] },
  },
  {
    id: 'tool-2',
    position: { x: 660, y: 120 },
    type: 'socketNode',
    data: { kind: 'tool', label: 'HTTPX', toolId: 'httpx', inputs: ['targets'], outputs: ['targets'] },
  },
  {
    id: 'tool-3',
    position: { x: 960, y: 120 },
    type: 'socketNode',
    data: { kind: 'tool', label: 'Nuclei', toolId: 'nuclei', inputs: ['targets'], outputs: ['findings'] },
  },
  {
    id: 'output-1',
    position: { x: 1260, y: 120 },
    type: 'socketNode',
    data: { kind: 'output', label: 'Artifacts', inputs: ['any'], outputs: [] },
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
      inputs: node.kind === 'tool' ? [] : node.kind === 'output' ? ['any'] : [],
      outputs: node.kind === 'variable' ? [node.variable_type || 'targets'] : [],
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
    '[+] Save a workflow, validate socket wiring, or launch a queued run.',
  ]);
  const [lastRun, setLastRun] = useState<RunRecord | null>(null);
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
        data: { kind: 'variable', label, variableType, inputs: [], outputs: [variableType] },
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
        data: { kind: 'output', label: 'Artifacts', inputs: ['any'], outputs: [] },
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
        data: { kind: 'tool', label: tool.name, toolId: tool.id, inputs: tool.inputs, outputs: tool.outputs },
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
      body: JSON.stringify({ name: workflowName, workflow: formatGraph(nodes, edges) }),
    });
    const result = await response.json();
    setLastRun(result);
    setConsoleTab('stdout');
    appendConsole(result.logs || ['[+] Run started.']);
  }

  function loadWorkflow(workflow: WorkflowRecord) {
    setWorkflowName(workflow.name);
    setNodes(hydrateNodesWithTools(graphToNodes(workflow), tools));
    setEdges(graphToEdges(workflow));
    appendConsole([`[+] Loaded workflow "${workflow.name}".`]);
  }

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

              {selectedNode.data.variableType && (
                <div className="meta-block">
                  <strong>Variable Type</strong>
                  <div>{selectedNode.data.variableType}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">Select a node to inspect its typed sockets and metadata.</div>
          )}

          <div className="section-title">Last Run</div>
          {lastRun ? (
            <div className="inspector-card">
              <h3>{lastRun.name}</h3>
              <p>Status: {lastRun.status}</p>
              <div className="meta-block">
                <strong>Parallel Groups</strong>
                <ul>{lastRun.parallel_groups.map((group, index) => <li key={index}>[{group.join(', ')}]</li>)}</ul>
              </div>
              <div className="meta-block">
                <strong>Node States</strong>
                <ul>{Object.entries(lastRun.node_states).map(([id, state]) => <li key={id}>{id}: {state}</li>)}</ul>
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
          {consoleTab === 'stdout' && consoleLines.join('\n')}
          {consoleTab === 'stderr' && '[-] No stderr captured yet.'}
          {consoleTab === 'stdin' && '[>] No stdin prompts in the simulated queue yet.'}
          {consoleTab === 'artifacts' && (lastRun ? lastRun.logs.filter((line) => line.includes('artifact')).join('\n') || '[+] No artifact paths emitted yet.' : '[+] No completed run yet.')}
        </pre>
      </section>
    </div>
  );
}
