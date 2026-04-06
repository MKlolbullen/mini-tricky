import { type DragEvent, useMemo, useState } from 'react';
import type { Tool, WorkflowRecord } from '../../types';
import { variableCatalog, outputCatalog, CATEGORY_COLORS } from '../../types';

type Props = {
  tools: Tool[];
  savedWorkflows: WorkflowRecord[];
  onAddTool: (tool: Tool) => void;
  onAddVariable: (type: string, label: string) => void;
  onAddOutput: () => void;
  onLoadWorkflow: (workflow: WorkflowRecord) => void;
};

function startDrag(event: DragEvent, type: string, data: any) {
  event.dataTransfer.setData('application/mini-tricky-node', JSON.stringify({ type, data }));
  event.dataTransfer.effectAllowed = 'move';
}

export default function ToolSidebar({ tools, savedWorkflows, onAddTool, onAddVariable, onAddOutput, onLoadWorkflow }: Props) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const cats = new Set(tools.map((t) => t.category));
    return Array.from(cats).sort();
  }, [tools]);

  const filteredTools = useMemo(() => {
    return tools.filter((tool) => {
      const matchesSearch = `${tool.name} ${tool.category} ${tool.description || ''}`.toLowerCase().includes(search.toLowerCase());
      const matchesCat = !activeCategory || tool.category === activeCategory;
      return matchesSearch && matchesCat;
    });
  }, [tools, search, activeCategory]);

  const groupedTools = useMemo(() => {
    const groups: Record<string, Tool[]> = {};
    for (const tool of filteredTools) {
      (groups[tool.category] ??= []).push(tool);
    }
    return groups;
  }, [filteredTools]);

  return (
    <aside className="sidebar left">
      <input
        className="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search tools..."
      />

      <div className="category-chips">
        <button
          className={`cat-chip ${!activeCategory ? 'active' : ''}`}
          onClick={() => setActiveCategory(null)}
        >
          All ({tools.length})
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`cat-chip ${activeCategory === cat ? 'active' : ''}`}
            style={activeCategory === cat ? { borderColor: CATEGORY_COLORS[cat] || '#5bdcff', color: CATEGORY_COLORS[cat] || '#5bdcff' } : undefined}
            onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="section-title">Script Nodes</div>
      <div
        className="palette-item tool draggable-item"
        draggable
        onDragStart={(e) => startDrag(e, 'script', { language: 'bash' })}
        onClick={() => {/* handled via drag or via BuilderView's addScriptNode */}}
      >
        <div className="tool-card-header">
          <strong>Bash Script</strong>
          <span className="tool-cat-badge" style={{ background: '#43d9ad' }}>Script</span>
        </div>
        <span className="tool-desc">Custom bash script with stdin/stdout</span>
      </div>
      <div
        className="palette-item tool draggable-item"
        draggable
        onDragStart={(e) => startDrag(e, 'script', { language: 'python' })}
      >
        <div className="tool-card-header">
          <strong>Python Script</strong>
          <span className="tool-cat-badge" style={{ background: '#ffcf5b' }}>Script</span>
        </div>
        <span className="tool-desc">Custom Python script with file I/O</span>
      </div>

      <div className="section-title">Variables</div>
      {variableCatalog.map((v) => (
        <div
          key={v.type}
          className="palette-item tool draggable-item"
          draggable
          onDragStart={(e) => startDrag(e, 'variable', { variableType: v.type, label: v.label })}
          onClick={() => onAddVariable(v.type, v.label)}
        >
          <strong>{v.label}</strong>
          <span>Output: {v.type}</span>
        </div>
      ))}

      <div className="section-title">Outputs</div>
      {outputCatalog.map((o) => (
        <div
          key={o.label}
          className="palette-item tool draggable-item"
          draggable
          onDragStart={(e) => startDrag(e, 'output', {})}
          onClick={onAddOutput}
        >
          <strong>{o.label}</strong>
          <span>Input: {o.type}</span>
        </div>
      ))}

      <div className="section-title">Tools ({filteredTools.length})</div>
      {Object.entries(groupedTools).map(([category, catTools]) => (
        <div key={category} className="tool-group">
          <div className="tool-group-header" style={{ borderLeftColor: CATEGORY_COLORS[category] || '#5bdcff' }}>
            {category} ({catTools.length})
          </div>
          {catTools.map((tool) => (
            <div
              key={tool.id}
              className="palette-item tool-card draggable-item"
              draggable
              onDragStart={(e) => startDrag(e, 'tool', { toolId: tool.id })}
              onClick={() => onAddTool(tool)}
            >
              <div className="tool-card-header">
                <strong>{tool.name}</strong>
                <span className="tool-cat-badge" style={{ background: CATEGORY_COLORS[tool.category] || '#5bdcff' }}>
                  {tool.category}
                </span>
              </div>
              {tool.description && <span className="tool-desc">{tool.description}</span>}
              <span className="tool-io">
                {tool.inputs.join(', ') || 'no inputs'} &rarr; {tool.outputs.join(', ') || 'no outputs'}
              </span>
            </div>
          ))}
        </div>
      ))}

      <div className="section-title">Saved Workflows</div>
      {savedWorkflows.length === 0 && <div className="empty-mini">No saved workflows yet.</div>}
      {savedWorkflows.map((wf) => (
        <button key={wf.id} className="palette-item tool" onClick={() => onLoadWorkflow(wf)}>
          <strong>{wf.name}</strong>
          <span>{wf.graph.nodes.length} nodes &middot; {wf.graph.edges.length} edges</span>
        </button>
      ))}
    </aside>
  );
}
