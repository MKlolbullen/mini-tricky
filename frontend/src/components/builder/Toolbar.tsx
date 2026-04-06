type Props = {
  workflowName: string;
  onNameChange: (name: string) => void;
  maxParallel: number;
  onMaxParallelChange: (n: number) => void;
  onSave: () => void;
  onValidate: () => void;
  onRun: () => void;
  onSaveAsTemplate: () => void;
};

export default function Toolbar({ workflowName, onNameChange, maxParallel, onMaxParallelChange, onSave, onValidate, onRun, onSaveAsTemplate }: Props) {
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
      <button className="action-btn" onClick={onSave}>Save Workflow</button>
      <button className="action-btn" onClick={onSaveAsTemplate}>Save as Template</button>
      <button className="action-btn" onClick={onValidate}>Validate Graph</button>
      <button className="action-btn primary" onClick={onRun}>Run Queue</button>
    </div>
  );
}
