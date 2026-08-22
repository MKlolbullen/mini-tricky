import { StopIcon, CheckIcon } from '../Icons';

export type RunProgressData = {
  status: 'running' | 'completed' | 'failed' | null;
  total: number;
  done: number;
  failed: number;
  running: number;
  queued: number;
  elapsedMs: number;
};

type Props = RunProgressData & {
  onCancel: () => void;
  onDismiss: () => void;
};

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

export default function RunProgress({
  status,
  total,
  done,
  failed,
  running,
  queued,
  elapsedMs,
  onCancel,
  onDismiss,
}: Props) {
  if (!status) return null;

  const finished = done + failed;
  const pct = total > 0 ? Math.round((finished / total) * 100) : 0;
  const isRunning = status === 'running';

  return (
    <div className={`run-progress ${status}`}>
      <div className="rp-top">
        <div className="rp-heading">
          {isRunning ? (
            <>
              <span className="rp-spinner" />
              <span className="rp-title">Running workflow</span>
            </>
          ) : status === 'completed' ? (
            <>
              <span className="rp-badge ok"><CheckIcon size={13} /></span>
              <span className="rp-title">Run complete</span>
            </>
          ) : (
            <>
              <span className="rp-badge fail">!</span>
              <span className="rp-title">Run finished with failures</span>
            </>
          )}
        </div>
        <div className="rp-actions">
          <span className="rp-timer">{fmtElapsed(elapsedMs)}</span>
          {isRunning ? (
            <button className="btn btn-sm tb-stop" onClick={onCancel}>
              <StopIcon size={13} /> Stop
            </button>
          ) : (
            <button className="icon-btn" onClick={onDismiss} title="Dismiss">
              &times;
            </button>
          )}
        </div>
      </div>

      <div className="rp-bar">
        <div
          className={`rp-fill ${failed > 0 ? 'has-fail' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="rp-stats">
        <span className="rp-stat">
          <b>{finished}</b>/{total} nodes
        </span>
        {running > 0 && <span className="rp-stat running">{running} running</span>}
        {queued > 0 && <span className="rp-stat queued">{queued} queued</span>}
        {done > 0 && <span className="rp-stat ok">{done} done</span>}
        {failed > 0 && <span className="rp-stat fail">{failed} failed</span>}
      </div>
    </div>
  );
}
