import { useEffect, useMemo, useState } from 'react';
import type { TemplateRecord } from '../../types';
import { CATEGORY_COLORS } from '../../types';
import * as api from '../../api';

type Props = {
  onUseTemplate: (template: TemplateRecord) => void;
  onImportMermaid?: () => void;
};

export default function TemplatesView({ onUseTemplate, onImportMermaid }: Props) {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.fetchTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(templates.map((t) => t.category));
    return Array.from(cats).sort();
  }, [templates]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      const matchesSearch = `${t.name} ${t.description} ${t.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase());
      const matchesCat = !activeCategory || t.category === activeCategory;
      return matchesSearch && matchesCat;
    });
  }, [templates, search, activeCategory]);

  return (
    <div className="templates-view">
      <div className="templates-header">
        <div>
          <h2>Workflow Templates</h2>
          <p className="templates-subtitle">Pre-built security workflows ready to customize and run.</p>
        </div>
        {onImportMermaid && (
          <button className="btn" onClick={onImportMermaid} style={{ flexShrink: 0 }}>Import Mermaid</button>
        )}
      </div>

      <div className="templates-controls">
        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
        />
        <div className="category-chips">
          <button className={`cat-chip ${!activeCategory ? 'active' : ''}`} onClick={() => setActiveCategory(null)}>
            All ({templates.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`cat-chip ${activeCategory === cat ? 'active' : ''}`}
              style={activeCategory === cat ? { borderColor: CATEGORY_COLORS[cat], color: CATEGORY_COLORS[cat] } : undefined}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading templates...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">No templates found. Save a workflow as a template from the Builder.</div>
      ) : (
        <div className="templates-grid">
          {filtered.map((t) => (
            <div key={t.id} className="template-card">
              <div className="template-card-header">
                <h3>{t.name}</h3>
                <span className="tool-cat-badge" style={{ background: CATEGORY_COLORS[t.category] || '#5bdcff' }}>
                  {t.category}
                </span>
              </div>
              <p className="template-desc">{t.description}</p>
              <div className="template-meta">
                <span>{t.graph.nodes.length} nodes &middot; {t.graph.edges.length} edges</span>
                {t.builtin && <span className="builtin-badge">Built-in</span>}
              </div>
              {t.tags.length > 0 && (
                <div className="template-tags">
                  {t.tags.map((tag) => <span key={tag} className="tag-chip">{tag}</span>)}
                </div>
              )}
              <button className="action-btn primary template-use-btn" onClick={() => onUseTemplate(t)}>
                Use Template
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
