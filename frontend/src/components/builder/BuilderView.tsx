import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addEdge, useEdgesState, useNodesState, type Connection, type Edge, type Node } from '@xyflow/react';
import type { Tool, WorkflowNodePayload, WorkflowRecord, RunRecord, ArtifactItem, ArtifactPreview, ReplayResponse, FlowNode, TemplateRecord } from '../../types';
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
      inputs: n.kind === 'tool' ? [] : n.kind === 'output' ? ['any'] : [],
      outputs: n.kind === 'variable' ? [n.variable_type || 'targets'] : [],
      runState: undefined,
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
  const [maxParallel, setMaxParallel] = useState(2);
  const counterRef = useRef(20);
  const hydratedRef = useRef(false);

  // Hydrate initial nodes with tool data once tools load
  useEffect(() => {
    if (tools.length > 0 && !hydratedRef.current) {
      hydratedRef.current = true;
      setNodes(hydrateNodesWithTools(initialNodes, tools));
    }
  }, [tools, setNodes]);

  // Load pending template
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

  // Fetch artifacts when run or selected node changes
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

  // Fetch artifact preview
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

  function getNextPosition() {
    counterRef.current += 1;
    const offset = counterRef.current * 24;
    return { x: 140 + (offset % 420), y: 180 + (offset % 260) };
  }

  function addToolNode(tool: Tool) {
    const id = `tool-${counterRef.current + 1}`;
    setNodes((cur) => [...cur, {
      id, position: getNextPosition(), type: 'socketNode',
      data: { kind: 'tool', label: tool.name, toolId: tool.id, params: {}, inputs: tool.inputs, outputs: tool.outputs, category: tool.category },
    }]);
  }

  function addVariableNode(type: string, label: string) {
    const id = `variable-${counterRef.current + 1}`;
    setNodes((cur) => [...cur, {
      id, position: getNextPosition(), type: 'socketNode',
      data: { kind: 'variable', label, variableType: type, value: '', params: {}, inputs: [], outputs: [type] },
    }]);
  }

  function addOutputNode() {
    const id = `output-${counterRef.current + 1}`;
    setNodes((cur) => [...cur, {
      id, position: getNextPosition(), type: 'socketNode',
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

  async function handleRun() {
    const result = await api.createRun({ name: workflowName, workflow: formatGraph(nodes, edges), max_parallel: maxParallel });
    setLastRun(result);
    setConsoleTab('stdout');
    if (result.node_states) setNodes((cur) => applyRunState(cur, result.node_states));
    setConsoleLines(result.logs || ['[+] Run started.']);
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
        onSaveAsTemplate={handleSaveAsTemplate}
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
