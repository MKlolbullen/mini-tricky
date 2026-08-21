import { useMemo, useState } from 'react';
import type { WorkflowRecord } from '../../types';
import { PlusIcon, PlayIcon, SearchIcon, TrashIcon, CopyIcon, NodesIcon } from '../Icons';

type Props = {
  workflows: WorkflowRecord[];
  onOpen: (wf: WorkflowRecord) => void;
  onRun: (wf: WorkflowRecord) => void;
  onDuplicate: (wf: WorkflowRecord) => void;
  onDelete: (wf: WorkflowRecord) => void;
  onNew: () => void;
};

type SortKey = 'name' | 'size';

export default function LibraryView({ workflows, onOpen, onRun, onDuplicate, onDelete, onNew }: Props) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('name');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = workflows.filter((wf) => !q || (wf.name || '').toLowerCase().includes(q));
    list = [...list].sort((a, b) => {
      if (sort === 'size') return (b.graph?.nodes?.length ?? 0) - (a.graph?.nodes?.length ?? 0);
      return (a.name || '').localeCompare(b.name || '');
    });
    return list;
  }, [workflows, search, sort]);

  return (
    <div className="page library">
      <div className="page-head">
        <div>
          <h1 className="page-title">Workflows</h1>
          <p className="page-sub">{workflows.length} saved workflow{workflows.length === 1 ? '' : 's'}</p>
        </div>
        <button className="btn btn-primary" onClick={onNew}>
          <PlusIcon size={18} /> New Workflow
        </button>
      </div>

      <div className="library-controls">
        <div className="search-wrap">
          <SearchIcon size={16} />
          <input
            className="search-inline"
            placeholder="Search workflows…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sort-toggle">
          <button className={`chip ${sort === 'name' ? 'active' : ''}`} onClick={() => setSort('name')}>
            Name
          </button>
          <button className={`chip ${sort === 'size' ? 'active' : ''}`} onClick={() => setSort('size')}>
            Size
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p>{workflows.length === 0 ? 'No workflows saved yet.' : 'No workflows match your search.'}</p>
          {workflows.length === 0 && (
            <button className="btn btn-ghost" onClick={onNew}>
              <PlusIcon size={16} /> Create your first workflow
            </button>
          )}
        </div>
      ) : (
        <div className="wf-grid">
          {filtered.map((wf) => {
            const nodeCount = wf.graph?.nodes?.length ?? 0;
            const edgeCount = wf.graph?.edges?.length ?? 0;
            const toolNodes = (wf.graph?.nodes ?? []).filter((n) => n.kind === 'tool').length;
            return (
              <div key={wf.id} className="wf-card" onClick={() => onOpen(wf)}>
                <div className="wf-card-body">
                  <div className="wf-card-title">{wf.name || 'Untitled workflow'}</div>
                  <div className="wf-card-stats">
                    <span><NodesIcon size={14} /> {nodeCount} nodes</span>
                    <span>{edgeCount} edges</span>
                    <span>{toolNodes} tools</span>
                  </div>
                  <div className="wf-card-preview">
                    {(wf.graph?.nodes ?? []).slice(0, 8).map((n, i) => (
                      <span key={i} className={`wf-chip kind-${n.kind}`}>{n.label || n.kind}</span>
                    ))}
                    {nodeCount > 8 && <span className="wf-chip more">+{nodeCount - 8}</span>}
                  </div>
                </div>
                <div className="wf-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-sm btn-primary" onClick={() => onRun(wf)} title="Run workflow">
                    <PlayIcon size={14} /> Run
                  </button>
                  <button className="btn btn-sm" onClick={() => onOpen(wf)} title="Open in builder">
                    Open
                  </button>
                  <button className="icon-btn" onClick={() => onDuplicate(wf)} title="Duplicate">
                    <CopyIcon size={15} />
                  </button>
                  <button className="icon-btn danger" onClick={() => onDelete(wf)} title="Delete">
                    <TrashIcon size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
