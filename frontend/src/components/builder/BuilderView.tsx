import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addEdge, useEdgesState, useNodesState, type Connection, type Edge, type Node } from '@xyflow/react';
import type { Tool, WorkflowNodePayload, WorkflowRecord, RunRecord, ArtifactItem, ArtifactPreview, ReplayResponse, FlowNode, TemplateRecord, WsEvent } from '../../types';
import * as api from '../../api';
import Toolbar from './Toolbar';
import ToolSidebar from './ToolSidebar';
import Canvas from './Canvas';
import Inspector from './Inspector';
import Console from './Console';

type Props = {
  tools: Tool[];
  savedWorkflows: WorkflowRecord[];
  onRefreshWorkflows: () => void;
  pendingTemplate: TemplateRecord | null;
  onTemplateClaimed: () => void;
};

const initialNodes: Node<WorkflowNodePayload>[] = [
  {
    id: 'variable-1', position: { x: 80, y: 120 }, type: 'socketNode',
    data: { kind: 'variable', label: 'Domain Input', variableType: 'domain', value: '', params: {}, inputs: [], outputs: ['domain'] },
  },
  {
    id: 'tool-1', position: { x: 360, y: 120 }, type: 'socketNode',
    data: { kind: 'tool', label: 'Subfinder', toolId: 'subfinder', params: {}, inputs: ['domain'], outputs: ['targets'] },
  },
  {
    id: 'tool-2', position: { x: 660, y: 120 }, type: 'socketNode',
    data: { kind: 'tool', label: 'HTTPX', toolId: 'httpx', params: {}, inputs: ['targets'], outputs: ['targets'] },
  },
  {
    id: 'tool-3', position: { x: 960, y: 120 }, type: 'socketNode',
    data: { kind: 'tool', label: 'Nuclei', toolId: 'nuclei', params: {}, inputs: ['targets'], outputs: ['findings'] },
  },
  {
    id: 'output-1', position: { x: 1260, y: 120 }, type: 'socketNode',
    data: { kind: 'output', label: 'Artifacts', params: {}, inputs: ['any'], outputs: [] },
  },
];

const initialEdges: Edge[] = [
  { id: 'e1', source: 'variable-1', sourceHandle: 'out:domain', target: 'tool-1', targetHandle: 'in:domain' },
  { id: 'e2', source: 'tool-1', sourceHandle: 'out:targets', target: 'tool-2', targetHandle: 'in:targets' },
  { id: 'e3', source: 'tool-2', sourceHandle: 'out:targets', target: 'tool-3', targetHandle: 'in:targets' },
  { id: 'e4', source: 'tool-3', sourceHandle: 'out:findings', target: 'output-1', targetHandle: 'in:any' },
];

function formatGraph(nodes: FlowNode[], edges: Edge[]) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id, kind: n.data.kind, label: n.data.label,
      tool_id: n.data.toolId ?? null, variable_type: n.data.variableType ?? null,
      value: n.data.value ?? null, params: n.data.params ?? {}, position: n.position,
      script_language: n.data.scriptLanguage ?? null,
      script_body: n.data.scriptBody ?? null,
    })),
    edges: edges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      source_handle: e.sourceHandle ?? null, target_handle: e.targetHandle ?? null,
    })),
  };
}

function graphToNodes(workflow: WorkflowRecord): FlowNode[] {
  return workflow.graph.nodes.map((n) => ({
    id: n.id, position: n.position || { x: 120, y: 120 }, type: 'socketNode',
    data: {
      kind: n.kind, label: n.label, toolId: n.tool_id || undefined,
      variableType: n.variable_type || undefined, value: n.value || '',
      params: n.params || {},
      inputs: n.kind === 'tool' ? [] : n.kind === 'output' ? ['any'] : n.kind === 'script' ? ['targets'] : [],
      outputs: n.kind === 'variable' ? [n.variable_type || 'targets'] : n.kind === 'script' ? ['targets'] : [],
      runState: undefined,
      scriptLanguage: (n.script_language as 'bash' | 'python') || undefined,
      scriptBody: n.script_body || undefined,
    },
  }));
}

function hydrateNodesWithTools(nodes: FlowNode[], tools: Tool[]): FlowNode[] {
  const byId = new Map(tools.map((t) => [t.id, t]));
  return nodes.map((node) => {
    if (node.data.kind === 'tool' && node.data.toolId && byId.has(node.data.toolId)) {
      const tool = byId.get(node.data.toolId)!;
      return { ...node, data: { ...node.data, label: tool.name, inputs: tool.inputs, outputs: tool.outputs, category: tool.category } };
    }
    return node;
  });
}

function graphToEdges(workflow: WorkflowRecord): Edge[] {
  return workflow.graph.edges.map((e, i) => ({
    id: e.id || `edge-${i}`, source: e.source, target: e.target,
    sourceHandle: e.source_handle || undefined, targetHandle: e.target_handle || undefined,
  }));
}

function applyRunState(nodes: FlowNode[], nodeStates: Record<string, string>): FlowNode[] {
  return nodes.map((n) => ({ ...n, data: { ...n.data, runState: nodeStates[n.id] } }));
}

export default function BuilderView({ tools, savedWorkflows, onRefreshWorkflows, pendingTemplate, onTemplateClaimed }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [workflowName, setWorkflowName] = useState('Starter Recon Chain');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [consoleTab, setConsoleTab] = useState<'stdout' | 'stderr' | 'stdin' | 'artifacts'>('stdout');
  const [consoleLines, setConsoleLines] = useState<string[]>(['[+] Ready.']);
  const [lastRun, setLastRun] = useState<RunRecord | null>(null);
  const [artifactItems, setArtifactItems] = useState<ArtifactItem[]>([]);
  const [selectedArtifactPath, setSelectedArtifactPath] = useState<string | null>(null);
  const [artifactPreview, setArtifactPreview] = useState<ArtifactPreview | null>(null);
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [maxParallel, setMaxParallel] = useState(2);
  const counterRef = useRef(20);
  const hydratedRef = useRef(false);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (tools.length > 0 && !hydratedRef.current) {
      hydratedRef.current = true;
      setNodes(hydrateNodesWithTools(initialNodes, tools));
    }
  }, [tools, setNodes]);

  useEffect(() => {
    if (pendingTemplate && tools.length > 0) {
      const wf: WorkflowRecord = { id: pendingTemplate.id, name: pendingTemplate.name, graph: pendingTemplate.graph };
      const hydrated = hydrateNodesWithTools(graphToNodes(wf), tools);
      setNodes(hydrated);
      setEdges(graphToEdges(wf));
      setWorkflowName(pendingTemplate.name);
      setSelectedNodeId(null);
      setLastRun(null);
      setConsoleLines([`[+] Loaded template "${pendingTemplate.name}".`]);
      onTemplateClaimed();
    }
  }, [pendingTemplate, tools, setNodes, setEdges, onTemplateClaimed]);

  useEffect(() => {
    if (!lastRun?.id) {
      setArtifactItems([]); setSelectedArtifactPath(null); setArtifactPreview(null);
      return;
    }
    api.fetchRunArtifacts(lastRun.id)
      .then((data) => {
        const items = data.items || [];
        setArtifactItems(items);
        const preferred = (selectedNodeId ? items.find((i) => i.node_id === selectedNodeId) : null) || items[0] || null;
        setSelectedArtifactPath((cur) => (cur && items.some((i) => i.path === cur)) ? cur : preferred?.path || null);
      })
      .catch(() => { setArtifactItems([]); setSelectedArtifactPath(null); });
  }, [lastRun?.id, selectedNodeId]);

  useEffect(() => {
    if (!lastRun?.id || !selectedArtifactPath) { setArtifactPreview(null); return; }
    setArtifactLoading(true);
    api.fetchArtifactPreview(lastRun.id, selectedArtifactPath)
      .then(setArtifactPreview)
      .catch(() => setArtifactPreview({ ok: false, error: 'Artifact preview request failed.' }))
      .finally(() => setArtifactLoading(false));
  }, [lastRun?.id, selectedArtifactPath]);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const selectedRunNode = useMemo(() => selectedNodeId && lastRun?.node_results ? lastRun.node_results[selectedNodeId] || null : null, [selectedNodeId, lastRun]);
  const selectedReplay = useMemo(() => {
    if (!selectedNodeId || !lastRun?.replays?.length) return null;
    return lastRun.replays.find((r) => r.node_id === selectedNodeId) || null;
  }, [selectedNodeId, lastRun]);
  const selectedTool = useMemo(() => {
    if (!selectedNode?.data.toolId) return null;
    return tools.find((t) => t.id === selectedNode.data.toolId) || null;
  }, [selectedNode, tools]);

  const stdoutView = selectedReplay?.result.stdout_preview || selectedRunNode?.stdout_preview || consoleLines.join('\n');
  const stderrView = selectedReplay?.result.stderr_preview || selectedRunNode?.stderr_preview || '[-] No stderr captured.';
  const artifactsView = selectedReplay
    ? (selectedReplay.result.artifact_paths.join('\n') || '[+] No replay artifacts.')
    : selectedRunNode
      ? (selectedRunNode.artifact_paths.join('\n') || '[+] No artifacts.')
      : (lastRun ? lastRun.logs.filter((l) => l.includes('artifact://')).join('\n') || '[+] No artifact paths yet.' : '[+] No completed run yet.');

  function nextId(prefix: string) {
    counterRef.current += 1;
    return `${prefix}-${counterRef.current}`;
  }

  // ── Drop handler for drag-and-drop from sidebar ───────────

  const handleDropNode = useCallback((type: string, data: any, position: { x: number; y: number }) => {
    if (type === 'tool') {
      const tool = tools.find((t) => t.id === data.toolId);
      if (!tool) return;
      const id = nextId('tool');
      setNodes((cur) => [...cur, {
        id, position, type: 'socketNode',
        data: { kind: 'tool', label: tool.name, toolId: tool.id, params: {}, inputs: tool.inputs, outputs: tool.outputs, category: tool.category },
      }]);
    } else if (type === 'variable') {
      const id = nextId('variable');
      setNodes((cur) => [...cur, {
        id, position, type: 'socketNode',
        data: { kind: 'variable', label: data.label, variableType: data.variableType, value: '', params: {}, inputs: [], outputs: [data.variableType] },
      }]);
    } else if (type === 'output') {
      const id = nextId('output');
      setNodes((cur) => [...cur, {
        id, position, type: 'socketNode',
        data: { kind: 'output', label: 'Artifacts', params: {}, inputs: ['any'], outputs: [] },
      }]);
    } else if (type === 'script') {
      const lang = data.language || 'bash';
      const id = nextId('script');
      setNodes((cur) => [...cur, {
        id, position, type: 'socketNode',
        data: {
          kind: 'script', label: `${lang === 'python' ? 'Python' : 'Bash'} Script`,
          params: {}, inputs: ['targets'], outputs: ['targets'],
          scriptLanguage: lang, scriptBody: lang === 'python' ? '# Read input from stdin, write to stdout\nimport sys\nfor line in sys.stdin:\n    print(line.strip())\n' : '#!/bin/bash\n# Read input from stdin, write to stdout\ncat\n',
          category: 'Script',
        },
      }]);
    }
  }, [tools, setNodes]);

  // ── Click-to-add handlers (keep for sidebar click fallback) ─

  function addToolNode(tool: Tool) {
    counterRef.current += 1;
    const offset = counterRef.current * 24;
    const position = { x: 140 + (offset % 420), y: 180 + (offset % 260) };
    setNodes((cur) => [...cur, {
      id: `tool-${counterRef.current}`, position, type: 'socketNode',
      data: { kind: 'tool', label: tool.name, toolId: tool.id, params: {}, inputs: tool.inputs, outputs: tool.outputs, category: tool.category },
    }]);
  }

  function addVariableNode(type: string, label: string) {
    counterRef.current += 1;
    const offset = counterRef.current * 24;
    const position = { x: 140 + (offset % 420), y: 180 + (offset % 260) };
    setNodes((cur) => [...cur, {
      id: `variable-${counterRef.current}`, position, type: 'socketNode',
      data: { kind: 'variable', label, variableType: type, value: '', params: {}, inputs: [], outputs: [type] },
    }]);
  }

  function addOutputNode() {
    counterRef.current += 1;
    const offset = counterRef.current * 24;
    const position = { x: 140 + (offset % 420), y: 180 + (offset % 260) };
    setNodes((cur) => [...cur, {
      id: `output-${counterRef.current}`, position, type: 'socketNode',
      data: { kind: 'output', label: 'Artifacts', params: {}, inputs: ['any'], outputs: [] },
    }]);
  }

  const onConnect = useCallback((params: Connection) => {
    const { source, target, sourceHandle, targetHandle } = params;
    if (!source || !target || !sourceHandle || !targetHandle) return;
    if (!sourceHandle.startsWith('out:') || !targetHandle.startsWith('in:')) return;
    const sourceType = sourceHandle.slice(4);
    const targetType = targetHandle.slice(3);
    if (targetType !== 'any' && sourceType !== targetType) {
      setConsoleLines([`[-] Socket type mismatch: ${sourceType} -> ${targetType}`]);
      return;
    }
    setEdges((cur) => {
      if (cur.some((e) => e.target === target && e.targetHandle === targetHandle)) {
        setConsoleLines([`[-] Target socket ${targetHandle} is already occupied.`]);
        return cur;
      }
      return addEdge({ ...params, id: `edge-${cur.length + 1}` }, cur);
    });
    setConsoleLines([`[+] Connected ${sourceHandle} -> ${targetHandle}`]);
  }, [setEdges]);

  // ── WebSocket streaming run ───────────────────────────────

  function handleRun() {
    const graph = formatGraph(nodes, edges);
    setIsRunning(true);
    setConsoleLines(['[+] Starting run...']);
    setConsoleTab('stdout');

    // Set all nodes to queued
    setNodes((cur) => cur.map((n) => ({ ...n, data: { ...n.data, runState: 'queued' } })));

    const { cancel } = api.streamRun(
      { name: workflowName, workflow: graph, max_parallel: maxParallel },
      (event: WsEvent) => {
        switch (event.type) {
          case 'run_started':
            setNodes((cur) => applyRunState(cur, event.node_states));
            setConsoleLines((prev) => [...prev, `[+] Run ${event.run_id} started.`]);
            break;
          case 'node_started':
            setNodes((cur) => cur.map((n) => n.id === event.node_id ? { ...n, data: { ...n.data, runState: 'running' } } : n));
            setConsoleLines((prev) => [...prev, `[>] ${event.node_id} running...`]);
            break;
          case 'node_log':
            setConsoleLines((prev) => [...prev, event.line]);
            break;
          case 'node_finished':
            setNodes((cur) => cur.map((n) => n.id === event.node_id ? { ...n, data: { ...n.data, runState: event.status } } : n));
            setConsoleLines((prev) => [...prev, ...event.result.logs]);
            break;
          case 'run_finished':
            setLastRun(event.run);
            setIsRunning(false);
            cancelRef.current = null;
            setConsoleLines((prev) => [...prev, `[+] Run finished: ${event.status}`]);
            break;
          case 'run_error':
            setIsRunning(false);
            cancelRef.current = null;
            setConsoleLines((prev) => [...prev, `[-] Run error: ${event.error}`]);
            break;
        }
      },
      () => {
        setIsRunning(false);
        cancelRef.current = null;
      },
    );

    cancelRef.current = cancel;
  }

  // Fallback: if WS fails, fall back to HTTP run
  async function handleRunFallback() {
    const result = await api.createRun({ name: workflowName, workflow: formatGraph(nodes, edges), max_parallel: maxParallel });
    setLastRun(result);
    setConsoleTab('stdout');
    if (result.node_states) setNodes((cur) => applyRunState(cur, result.node_states));
    setConsoleLines(result.logs || ['[+] Run started.']);
  }

  function handleCancel() {
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
      setIsRunning(false);
      setConsoleLines((prev) => [...prev, '[!] Run cancelled by user.']);
    }
  }

  async function handleSave() {
    const result = await api.saveWorkflow({ name: workflowName, graph: formatGraph(nodes, edges) });
    onRefreshWorkflows();
    setConsoleLines([`[+] Saved workflow "${result.name}" (${result.id}).`]);
  }

  async function handleValidate() {
    const result = await api.validateGraph(formatGraph(nodes, edges));
    if (result.ok) {
      setConsoleLines([
        '[+] Graph validated successfully.',
        `[+] Topological order: ${result.topological_order.join(' -> ')}`,
        `[+] Parallel groups: ${result.parallel_groups.map((g: string[]) => `[${g.join(', ')}]`).join(' ')}`,
      ]);
    } else {
      setConsoleLines([`[-] Validation failed: ${result.error}`]);
    }
  }

  async function handleReplay() {
    if (!lastRun?.id || !selectedNodeId) return;
    setIsReplaying(true);
    try {
      const result: ReplayResponse = await api.replayNode(lastRun.id, selectedNodeId);
      if (!result.ok) { setConsoleLines([`[-] Replay failed: ${result.error || 'unknown error'}`]); return; }
      const refreshed = await api.fetchRun(lastRun.id);
      setLastRun(refreshed);
      setNodes((cur) => cur.map((n) => n.id === selectedNodeId ? { ...n, data: { ...n.data, runState: result.result.status } } : n));
      setConsoleTab('stdout');
      setConsoleLines([`[+] Replay ${result.replay_id} completed for ${selectedNodeId}.`, ...result.result.logs]);
    } catch {
      setConsoleLines(['[-] Replay request failed.']);
    } finally {
      setIsReplaying(false);
    }
  }

  function handleLoadWorkflow(wf: WorkflowRecord) {
    setWorkflowName(wf.name);
    const hydrated = hydrateNodesWithTools(graphToNodes(wf), tools);
    setNodes(hydrated);
    setEdges(graphToEdges(wf));
    setSelectedNodeId(null);
    setLastRun(null);
    setConsoleLines([`[+] Loaded workflow "${wf.name}".`]);
  }

  function handleSaveAsTemplate() {
    const name = prompt('Template name:', workflowName);
    if (!name) return;
    const desc = prompt('Description:', '') || '';
    const category = prompt('Category (e.g. Recon, Vulnerability, Full Pipeline):', 'Recon') || 'Recon';
    api.saveAsTemplate({ name, description: desc, category, tags: [], graph: formatGraph(nodes, edges) })
      .then(() => setConsoleLines([`[+] Saved as template "${name}".`]))
      .catch(() => setConsoleLines(['[-] Failed to save template.']));
  }

  function handleExport() {
    const wf: WorkflowRecord = {
      id: `export-${Date.now()}`,
      name: workflowName,
      graph: formatGraph(nodes, edges),
    };
    api.exportWorkflow(wf);
    setConsoleLines([`[+] Exported workflow "${workflowName}".`]);
  }

  async function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const wf = await api.importWorkflow(file);
        handleLoadWorkflow(wf);
        setConsoleLines([`[+] Imported workflow "${wf.name}".`]);
      } catch {
        setConsoleLines(['[-] Failed to import workflow.']);
      }
    };
    input.click();
  }

  return (
    <>
      <Toolbar
        workflowName={workflowName}
        onNameChange={setWorkflowName}
        maxParallel={maxParallel}
        onMaxParallelChange={setMaxParallel}
        onSave={handleSave}
        onValidate={handleValidate}
        onRun={handleRun}
        onRunFallback={handleRunFallback}
        onCancel={handleCancel}
        isRunning={isRunning}
        onSaveAsTemplate={handleSaveAsTemplate}
        onExport={handleExport}
        onImport={handleImport}
      />
      <div className="workspace">
        <ToolSidebar
          tools={tools}
          savedWorkflows={savedWorkflows}
          onAddTool={addToolNode}
          onAddVariable={addVariableNode}
          onAddOutput={addOutputNode}
          onLoadWorkflow={handleLoadWorkflow}
        />
        <Canvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={setSelectedNodeId}
          onDropNode={handleDropNode}
        />
        <Inspector
          selectedNode={selectedNode}
          selectedTool={selectedTool}
          lastRun={lastRun}
          selectedRunNode={selectedRunNode}
          selectedReplay={selectedReplay}
          isReplaying={isReplaying}
          onReplay={handleReplay}
          onUpdateNodeData={(id, patch) => setNodes((cur) => cur.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))}
          artifactItems={artifactItems}
          selectedArtifactPath={selectedArtifactPath}
          onSelectArtifact={setSelectedArtifactPath}
          artifactPreview={artifactPreview}
          artifactLoading={artifactLoading}
        />
      </div>
      <Console
        consoleTab={consoleTab}
        onTabChange={setConsoleTab}
        stdoutView={stdoutView}
        stderrView={stderrView}
        artifactsView={artifactsView}
      />
    </>
  );
}
