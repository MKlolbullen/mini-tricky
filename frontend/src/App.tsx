import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
} from '@xyflow/react';

type Tool = {
  id: string;
  name: string;
  category: string;
  inputs: string[];
  outputs: string[];
};

type Health = { status: string };

const initialNodes = [
  { id: 'input-1', position: { x: 80, y: 120 }, data: { label: 'Target List' }, type: 'input' },
  { id: 'tool-1', position: { x: 380, y: 120 }, data: { label: 'HTTPX' } },
  { id: 'tool-2', position: { x: 700, y: 120 }, data: { label: 'Nuclei' } },
  { id: 'output-1', position: { x: 1010, y: 120 }, data: { label: 'Artifacts' }, type: 'output' },
];

const initialEdges = [
  { id: 'e1', source: 'input-1', target: 'tool-1' },
  { id: 'e2', source: 'tool-1', target: 'tool-2' },
  { id: 'e3', source: 'tool-2', target: 'output-1' },
];

const apiBase = (window as any).miniTrickyDesktop?.apiBase || 'http://127.0.0.1:5000';

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes as any);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges as any);
  const [tools, setTools] = useState<Tool[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`${apiBase}/api/health`).then((r) => r.json()).then(setHealth).catch(() => setHealth({ status: 'offline' }));
    fetch(`${apiBase}/api/tools`).then((r) => r.json()).then(setTools).catch(() => setTools([]));
  }, []);

  const filteredTools = useMemo(() => {
    return tools.filter((tool) => `${tool.name} ${tool.category}`.toLowerCase().includes(search.toLowerCase()));
  }, [tools, search]);

  const onConnect = (params: Connection) => setEdges((eds) => addEdge(params, eds));

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
        <div className={`status-pill ${health?.status === 'ok' ? 'ok' : 'warn'}`}>
          API: {health?.status || 'checking'}
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar left">
          <input
            className="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools..."
          />
          <div className="section-title">Variables</div>
          <div className="palette-item">Target List</div>
          <div className="palette-item">Domain Input</div>
          <div className="palette-item">URL Input</div>

          <div className="section-title">Tools</div>
          {filteredTools.map((tool) => (
            <button key={tool.id} className="palette-item tool" onClick={() => setSelectedTool(tool)}>
              <strong>{tool.name}</strong>
              <span>{tool.category}</span>
            </button>
          ))}
        </aside>

        <main className="canvas-wrap">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
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
          {selectedTool ? (
            <div className="inspector-card">
              <h3>{selectedTool.name}</h3>
              <p>{selectedTool.category}</p>
              <div className="meta-block">
                <strong>Inputs</strong>
                <ul>{selectedTool.inputs.map((v) => <li key={v}>{v}</li>)}</ul>
              </div>
              <div className="meta-block">
                <strong>Outputs</strong>
                <ul>{selectedTool.outputs.map((v) => <li key={v}>{v}</li>)}</ul>
              </div>
            </div>
          ) : (
            <div className="empty-state">Select a tool to inspect its sockets and metadata.</div>
          )}
        </aside>
      </div>

      <section className="console">
        <div className="console-tabs">
          <button className="console-tab active">STDOUT</button>
          <button className="console-tab">STDERR</button>
          <button className="console-tab">STDIN</button>
          <button className="console-tab">Artifacts</button>
        </div>
        <pre className="console-output">[+] Ready. Backend contract loaded.\n[+] Next milestone: typed sockets, execution queue, and artifact persistence.</pre>
      </section>
    </div>
  );
}
