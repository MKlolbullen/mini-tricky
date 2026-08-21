import { useState } from 'react';
import { UndoIcon, RedoIcon, SaveIcon, PlayIcon, StopIcon, SparkleIcon, CheckIcon } from '../Icons';

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
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
};

export default function Toolbar({
  workflowName, onNameChange, maxParallel, onMaxParallelChange,
  onSave, onValidate, onRun, onRunFallback, onCancel, isRunning,
  onSaveAsTemplate, onExport, onImport, onGenerate,
  onUndo, onRedo, canUndo, canRedo,
}: Props) {
  const [showGenerator, setShowGenerator] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [genScope, setGenScope] = useState('');

  return (
    <div className="toolbar-wrap">
      <div className="toolbar">
        {/* Identity */}
        <div className="tb-group tb-identity">
          <input
            className="name-input"
            value={workflowName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Workflow name"
          />
          <label className="parallel-wrap" title="Max parallel workers">
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
        </div>

        <div className="tb-sep" />

        {/* History */}
        <div className="tb-group">
          <button className="tb-btn icon-only" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <UndoIcon size={17} />
          </button>
          <button className="tb-btn icon-only" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            <RedoIcon size={17} />
          </button>
        </div>

        <div className="tb-sep" />

        {/* File actions */}
        <div className="tb-group">
          <button className="tb-btn" onClick={onSave} title="Save (Ctrl+S)">
            <SaveIcon size={16} /> Save
          </button>
          <button className="tb-btn" onClick={onSaveAsTemplate} title="Save as template">Template</button>
          <button className="tb-btn" onClick={onExport} title="Export workflow JSON (Ctrl+E)">Export</button>
          <button className="tb-btn" onClick={onImport} title="Import workflow JSON">Import</button>
          <button className="tb-btn" onClick={onValidate} title="Validate the graph">
            <CheckIcon size={16} /> Validate
          </button>
        </div>

        {/* Run cluster — right aligned */}
        <div className="tb-group tb-run">
          <button
            className={`tb-btn generate ${showGenerator ? 'active' : ''}`}
            onClick={() => setShowGenerator(!showGenerator)}
            title="AI-assisted workflow generation"
          >
            <SparkleIcon size={16} /> Generate
          </button>
          {isRunning ? (
            <button className="btn btn-sm tb-stop" onClick={onCancel} title="Cancel the running workflow">
              <StopIcon size={15} /> Stop
            </button>
          ) : (
            <>
              <button className="btn btn-sm btn-primary" onClick={onRun} title="Run with live streaming (Ctrl+Enter)">
                <PlayIcon size={15} /> Run
              </button>
              <button className="tb-btn" onClick={onRunFallback} title="Run without WebSocket streaming">Batch</button>
            </>
          )}
        </div>
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
              className="btn btn-primary"
              disabled={!genPrompt.trim()}
              style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}
              onClick={() => {
                onGenerate(genPrompt, genScope);
                setShowGenerator(false);
                setGenPrompt('');
                setGenScope('');
              }}
            >
              <SparkleIcon size={16} /> Generate Workflow
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
