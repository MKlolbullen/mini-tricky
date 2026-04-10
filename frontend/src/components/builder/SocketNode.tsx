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

  // Count active (toggled-on) params for badge
  const activeArgs = Object.keys(payload.params || {}).length;

  return (
    <div
      className={`flow-node ${payload.kind} ${stateClass} ${selected ? 'selected' : ''}`}
      style={catColor ? { borderLeftColor: catColor, borderLeftWidth: 3 } : undefined}
    >
      {/* Header */}
      <div className="flow-node-header">
        <span className="flow-node-title">
          {catIcon ? <span className="node-cat-icon">{catIcon} </span> : null}
          {payload.label}
        </span>
        <small>
          {isCondition ? 'condition' : isLoop ? 'loop' : isModule ? 'module' : isScript ? payload.scriptLanguage : payload.kind === 'tool' ? payload.toolId : payload.kind}
        </small>
      </div>

      {/* State pill */}
      {payload.runState && <div className={`node-state-pill ${payload.runState}`}>{payload.runState}</div>}

      {/* Active args badge */}
      {activeArgs > 0 && payload.kind === 'tool' && (
        <div className="node-args-badge">{activeArgs} arg{activeArgs > 1 ? 's' : ''}</div>
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
