import { useState } from 'react';

type Props = {
  workflowName: string;
  onNameChange: (name: string) => void;
  maxParallel: number;
  onMaxParallelChange: (n: number) => void;
  onSave: () => void;
  onValidate: () => void;
  onRun: () => void;
  onRunFallback: () => void;
  onCancel: () => void;
  isRunning: boolean;
  onSaveAsTemplate: () => void;
  onExport: () => void;
  onImport: () => void;
  onGenerate: (prompt: string, scope: string) => void;
};

export default function Toolbar({
  workflowName, onNameChange, maxParallel, onMaxParallelChange,
  onSave, onValidate, onRun, onRunFallback, onCancel, isRunning,
  onSaveAsTemplate, onExport, onImport, onGenerate,
}: Props) {
  const [showGenerator, setShowGenerator] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [genScope, setGenScope] = useState('');

  return (
    <div className="toolbar-wrap">
      <div className="toolbar">
        <input
          className="name-input"
          value={workflowName}
          onChange={(e) => onNameChange(e.target.value)}
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
            onChange={(e) => onMaxParallelChange(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <button className="action-btn" onClick={onSave}>Save</button>
        <button className="action-btn" onClick={onSaveAsTemplate}>Template</button>
        <button className="action-btn" onClick={onExport}>Export</button>
        <button className="action-btn" onClick={onImport}>Import</button>
        <button className="action-btn" onClick={onValidate}>Validate</button>
        <button className="action-btn generate-btn" onClick={() => setShowGenerator(!showGenerator)} title="AI-assisted workflow generation">
          Generate
        </button>
        {isRunning ? (
          <button className="action-btn danger" onClick={onCancel}>Cancel Run</button>
        ) : (
          <>
            <button className="action-btn primary" onClick={onRun}>Run (Stream)</button>
            <button className="action-btn" onClick={onRunFallback} title="Run without WebSocket streaming">Run (Batch)</button>
          </>
        )}
      </div>

      {showGenerator && (
        <div className="generator-panel">
          <div className="generator-header">
            <strong>Workflow Generator</strong>
            <button className="notification-close" onClick={() => setShowGenerator(false)}>&times;</button>
          </div>
          <div className="generator-body">
            <input
              className="arg-field-input"
              placeholder="Describe what you want... e.g. 'full recon with subdomain enum and vuln scanning'"
              value={genPrompt}
              onChange={(e) => setGenPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && genPrompt.trim()) {
                  onGenerate(genPrompt, genScope);
                  setShowGenerator(false);
                  setGenPrompt('');
                  setGenScope('');
                }
              }}
            />
            <input
              className="arg-field-input"
              placeholder="Target scope (optional, e.g. example.com)"
              value={genScope}
              onChange={(e) => setGenScope(e.target.value)}
              style={{ marginTop: 4 }}
            />
            <div className="generator-hints">
              <span>Try:</span>
              <button className="gen-hint" onClick={() => setGenPrompt('full recon and vulnerability scan')}>full recon + vuln</button>
              <button className="gen-hint" onClick={() => setGenPrompt('subdomain enumeration')}>subdomain enum</button>
              <button className="gen-hint" onClick={() => setGenPrompt('port scan and service detection')}>port scan</button>
              <button className="gen-hint" onClick={() => setGenPrompt('crawl and fuzz directories')}>crawl + fuzz</button>
              <button className="gen-hint" onClick={() => setGenPrompt('osint gathering')}>OSINT</button>
            </div>
            <button
              className="action-btn primary"
              disabled={!genPrompt.trim()}
              onClick={() => {
                onGenerate(genPrompt, genScope);
                setShowGenerator(false);
                setGenPrompt('');
                setGenScope('');
              }}
              style={{ marginTop: 8, width: '100%' }}
            >
              Generate Workflow
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
