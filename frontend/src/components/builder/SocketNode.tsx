import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { WorkflowNodePayload } from '../../types';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../../types';

/** Color map for socket data types */
const SOCKET_COLORS: Record<string, string> = {
  domain: '#5b8cff',
  targets: '#43d9ad',
  wordlist: '#ffcf5b',
  findings: '#ff5b6c',
  any: '#b47cff',
  pass: '#43d9ad',
  fail: '#ff5b6c',
  item: '#ffcf5b',
};

function socketColor(name: string): string {
  return SOCKET_COLORS[name] || '#63e6ff';
}

// Build compact "flag value" chips from a node's configured params. Boolean
// flags are stored with the '__flag__' sentinel (see Inspector) and render as
// the bare flag.
function summarizeParams(params: Record<string, string> | undefined): string[] {
  if (!params) return [];
  return Object.entries(params).map(([flag, value]) =>
    value === '__flag__' || value === '' ? flag : `${flag} ${value}`,
  );
}

export default function SocketNode({ data, selected }: NodeProps<Node<WorkflowNodePayload>>) {
  const payload = data as WorkflowNodePayload;
  const stateClass = payload.runState ? `state-${payload.runState}` : '';
  const isScript = payload.kind === 'script';
  const isModule = payload.kind === 'module';
  const isCondition = payload.kind === 'condition';
  const isLoop = payload.kind === 'loop';
  const catColor = isCondition
    ? '#ff9f43'
    : isLoop
      ? '#ffcf5b'
      : isModule
        ? '#b47cff'
        : isScript
          ? (payload.scriptLanguage === 'python' ? '#ffcf5b' : '#43d9ad')
          : payload.category ? CATEGORY_COLORS[payload.category] || '#5bdcff' : undefined;
  const catIcon = isCondition
    ? '\u{2696}'
    : isLoop
      ? '\u{1F504}'
      : isModule
        ? '\u{1F9E9}'
        : isScript
          ? (payload.scriptLanguage === 'python' ? '\u{1F40D}' : '\u{1F4DC}')
          : payload.category ? CATEGORY_ICONS[payload.category] || '' : '';

  const subtitle = isCondition ? 'condition' : isLoop ? 'loop' : isModule ? 'module' : isScript ? payload.scriptLanguage : payload.kind === 'tool' ? payload.toolId : payload.kind;

  // Inline argument summary — the configured params, shown at a glance.
  const argChips = summarizeParams(payload.params);
  const MAX_CHIPS = 3;

  return (
    <div
      className={`flow-node ${payload.kind} ${stateClass} ${selected ? 'selected' : ''}`}
      style={catColor ? { borderLeftColor: catColor, borderLeftWidth: 3 } : undefined}
    >
      {/* Header */}
      <div className="flow-node-header">
        {catIcon ? (
          <span
            className="node-icon-badge"
            style={catColor ? { background: `${catColor}22`, color: catColor } : undefined}
          >
            {catIcon}
          </span>
        ) : null}
        <div className="flow-node-heading">
          <span className="flow-node-title">{payload.label}</span>
          <small>{subtitle}</small>
        </div>
      </div>

      {/* Live run-state glyph (top-right) */}
      {payload.runState && payload.runState !== 'queued' && (
        <span className={`node-status-glyph ${payload.runState}`} title={payload.runState}>
          {payload.runState === 'running' ? (
            <span className="node-spinner" />
          ) : payload.runState === 'success' || payload.runState === 'completed' ? (
            '✓'
          ) : (
            '✗'
          )}
        </span>
      )}

      {/* State pill */}
      {payload.runState && <div className={`node-state-pill ${payload.runState}`}>{payload.runState}</div>}

      {/* Inline argument summary */}
      {argChips.length > 0 && (
        <div className="node-args">
          {argChips.slice(0, MAX_CHIPS).map((chip, i) => (
            <span key={i} className="node-arg-chip" title={chip}>{chip}</span>
          ))}
          {argChips.length > MAX_CHIPS && (
            <span className="node-arg-chip more">+{argChips.length - MAX_CHIPS}</span>
          )}
        </div>
      )}

      {/* Input sockets — Trickest style */}
      {payload.inputs.length > 0 && (
        <div className="socket-list left">
          {payload.inputs.map((input, index) => (
            <div
              key={input}
              className="socket-row left"
              style={{ top: 52 + index * 28 }}
              title={`Input socket — type: ${input}${input === 'any' ? ' (accepts any output)' : ` (accepts: ${input}, any)`}`}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={`in:${input}`}
                isConnectableStart={false}
                isConnectableEnd={true}
                style={{ background: socketColor(input), borderColor: socketColor(input) }}
              />
              <span className="socket-label">
                <span className="socket-dot" style={{ background: socketColor(input) }} />
                {input}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Output sockets — Trickest style */}
      {payload.outputs.length > 0 && (
        <div className="socket-list right">
          {payload.outputs.map((output, index) => (
            <div
              key={output}
              className="socket-row right"
              style={{ top: 52 + index * 28 }}
              title={`Output socket — type: ${output} (connects to: ${output} or any inputs)`}
            >
              <span className="socket-label">
                {output}
                <span className="socket-dot" style={{ background: socketColor(output) }} />
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={`out:${output}`}
                isConnectableStart={true}
                isConnectableEnd={false}
                style={{ background: socketColor(output), borderColor: socketColor(output) }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
