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
};

export default function Toolbar({
  workflowName, onNameChange, maxParallel, onMaxParallelChange,
  onSave, onValidate, onRun, onRunFallback, onCancel, isRunning,
  onSaveAsTemplate, onExport, onImport,
}: Props) {
  return (
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
      {isRunning ? (
        <button className="action-btn danger" onClick={onCancel}>Cancel Run</button>
      ) : (
        <>
          <button className="action-btn primary" onClick={onRun}>Run (Stream)</button>
          <button className="action-btn" onClick={onRunFallback} title="Run without WebSocket streaming">Run (Batch)</button>
        </>
      )}
    </div>
  );
}
