import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { WorkflowNodePayload } from '../../types';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../../types';

export default function SocketNode({ data, selected }: NodeProps<Node<WorkflowNodePayload>>) {
  const payload = data as WorkflowNodePayload;
  const stateClass = payload.runState ? `state-${payload.runState}` : '';
  const catColor = payload.category ? CATEGORY_COLORS[payload.category] || '#5bdcff' : undefined;
  const catIcon = payload.category ? CATEGORY_ICONS[payload.category] || '' : '';

  return (
    <div
      className={`flow-node ${payload.kind} ${stateClass} ${selected ? 'selected' : ''}`}
      style={catColor ? { borderLeftColor: catColor, borderLeftWidth: 3 } : undefined}
    >
      <div className="flow-node-header">
        <span>
          {payload.kind === 'tool' && catIcon ? <span className="node-cat-icon">{catIcon} </span> : null}
          {payload.label}
        </span>
        <small>{payload.kind === 'tool' ? payload.toolId : payload.kind}</small>
      </div>

      {payload.runState && <div className={`node-state-pill ${payload.runState}`}>{payload.runState}</div>}

      {payload.inputs.length > 0 && (
        <div className="socket-list left">
          {payload.inputs.map((input, index) => (
            <div key={input} className="socket-row left" style={{ top: 52 + index * 26 }}>
              <Handle type="target" position={Position.Left} id={`in:${input}`} />
              <span>{input}</span>
            </div>
          ))}
        </div>
      )}

      {payload.outputs.length > 0 && (
        <div className="socket-list right">
          {payload.outputs.map((output, index) => (
            <div key={output} className="socket-row right" style={{ top: 52 + index * 26 }}>
              <span>{output}</span>
              <Handle type="source" position={Position.Right} id={`out:${output}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
