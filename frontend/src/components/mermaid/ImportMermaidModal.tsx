import { useState } from 'react';
import * as api from '../../api';
import type { MermaidImportResult } from '../../api';
import type { WorkflowRecord } from '../../types';
import { NodesIcon, PlayIcon, TemplatesIcon, CheckIcon } from '../Icons';

type Props = {
  onClose: () => void;
  onLoad: (name: string, graph: WorkflowRecord['graph']) => void;
  onSavedTemplate: () => void;
};

const SAMPLE = `flowchart LR
  A[domain: example.com] --> B[subfinder]
  B --> C[httpx]
  C --> D[nuclei]
  D --> E[Artifacts]`;

export default function ImportMermaidModal({ onClose, onLoad, onSavedTemplate }: Props) {
  const [text, setText] = useState(SAMPLE);
  const [name, setName] = useState('');
  const [result, setResult] = useState<MermaidImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  async function parse() {
    setBusy(true);
    setSavedMsg(null);
    try {
      setResult(await api.importMermaid(text, name || 'Imported workflow'));
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    setBusy(true);
    try {
      const r = await api.importMermaid(text, name || 'Imported workflow', 'template');
      if (r.ok) {
        setSavedMsg('Saved to your templates.');
        onSavedTemplate();
      }
    } finally {
      setBusy(false);
    }
  }

  const canAct = result?.ok && result.graph;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal mermaid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Import from Mermaid</h2>
          <button className="notification-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <label className="form-field">
            <span>Workflow name</span>
            <input className="form-input" value={name} placeholder="My imported workflow" onChange={(e) => setName(e.target.value)} />
          </label>

          <label className="form-field">
            <span>Mermaid flowchart</span>
            <textarea
              className="form-input mono mermaid-input"
              rows={10}
              value={text}
              onChange={(e) => { setText(e.target.value); setResult(null); }}
              spellCheck={false}
            />
          </label>

          <div className="mermaid-hint">
            Nodes matching a tool id/name become tool nodes; <code>domain: x</code> / <code>targets: x</code> become
            variables; a sink like <code>Artifacts</code> becomes an output. Prefix to be explicit:
            {' '}<code>tool:</code> <code>var:</code> <code>out:</code> <code>script:bash=…</code> <code>cond:</code> <code>loop:</code>.
            {' '}Edge socket types are inferred from the tools they connect.
            <button className="link-btn" onClick={() => { setText(SAMPLE); setResult(null); }}>Reset sample</button>
          </div>

          {result && (
            <div className={`mermaid-result ${result.ok ? (result.valid ? 'ok' : 'warn') : 'err'}`}>
              {!result.ok ? (
                <div className="mermaid-result-head">Could not parse: {result.error}</div>
              ) : (
                <>
                  <div className="mermaid-result-head">
                    {result.valid ? <CheckIcon size={15} /> : null}
                    Parsed {result.node_count} node{result.node_count === 1 ? '' : 's'} · {result.edge_count} edge{result.edge_count === 1 ? '' : 's'}
                    {result.valid ? ' — ready to run' : ' — needs fixes in the builder'}
                  </div>
                  {!result.valid && result.validation_error && (
                    <div className="mermaid-result-line err">{result.validation_error}</div>
                  )}
                  {(result.warnings || []).map((w, i) => (
                    <div key={i} className="mermaid-result-line">{w}</div>
                  ))}
                </>
              )}
            </div>
          )}

          {savedMsg && <div className="mermaid-result ok"><div className="mermaid-result-head">{savedMsg}</div></div>}
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          {!canAct ? (
            <button className="btn btn-primary" onClick={parse} disabled={busy || !text.trim()}>
              <NodesIcon size={16} /> {busy ? 'Parsing…' : 'Parse'}
            </button>
          ) : (
            <>
              <button className="btn" onClick={saveTemplate} disabled={busy}>
                <TemplatesIcon size={16} /> Save as Template
              </button>
              <button
                className="btn btn-primary"
                onClick={() => onLoad(result!.name || name || 'Imported workflow', result!.graph!)}
              >
                <PlayIcon size={16} /> Open in Builder
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
