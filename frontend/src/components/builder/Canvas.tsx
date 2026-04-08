import { useCallback, type DragEvent } from 'react';
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, MarkerType, type Connection, type Edge, type Node, type DefaultEdgeOptions } from '@xyflow/react';
import SocketNode from './SocketNode';
import type { WorkflowNodePayload } from '../../types';
import { CATEGORY_COLORS } from '../../types';

const nodeTypes = { socketNode: SocketNode };

const defaultEdgeOptions: DefaultEdgeOptions = {
  animated: true,
  style: { strokeWidth: 2, stroke: '#5bdcff88' },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#5bdcff', width: 16, height: 16 },
};

// Live drag-time guard: React Flow calls this as the user drags an edge and
// refuses to draw the preview line when this returns false. It's the first
// line of defence against input->input and output->output connections.
function isValidConnection(connection: Connection | Edge): boolean {
  const { source, target, sourceHandle, targetHandle } = connection as Connection;
  if (!source || !target || !sourceHandle || !targetHandle) return false;
  // No self-loops.
  if (source === target) return false;
  // Source handle must be an output (id prefix `out:`).
  if (!sourceHandle.startsWith('out:')) return false;
  // Target handle must be an input (id prefix `in:`).
  if (!targetHandle.startsWith('in:')) return false;
  const sourceType = sourceHandle.slice(4);
  const targetType = targetHandle.slice(3);
  // Type check: `any` accepts everything, otherwise names must match.
  if (targetType !== 'any' && sourceType !== targetType) return false;
  return true;
}

function minimapNodeColor(node: Node<WorkflowNodePayload>): string {
  const payload = node.data as WorkflowNodePayload;
  if (payload.kind === 'variable') return '#43d9ad';
  if (payload.kind === 'output') return '#ff9f43';
  if (payload.kind === 'script') return payload.scriptLanguage === 'python' ? '#ffcf5b' : '#43d9ad';
  if (payload.kind === 'module') return '#b47cff';
  if (payload.kind === 'condition') return '#ff9f43';
  if (payload.kind === 'loop') return '#ffcf5b';
  if (payload.category && CATEGORY_COLORS[payload.category]) return CATEGORY_COLORS[payload.category];
  return '#5bdcff';
}

type Props = {
  nodes: Node<WorkflowNodePayload>[];
  edges: Edge[];
  onNodesChange: any;
  onEdgesChange: any;
  onConnect: (params: Connection) => void;
  onNodeClick: (nodeId: string) => void;
  onDropNode: (type: string, data: any, position: { x: number; y: number }) => void;
};

// `useReactFlow()` requires a `<ReactFlowProvider>` ancestor. The `<ReactFlow>`
// component provides the store to its *children*, not to siblings in the same
// component, so we split Canvas into an inner component that calls the hook
// and an outer wrapper that mounts the provider.
function CanvasInner({ nodes, edges, onNodesChange, onEdgesChange, onConnect, onNodeClick, onDropNode }: Props) {
  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/mini-tricky-node');
    if (!raw) return;

    try {
      const payload = JSON.parse(raw);
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onDropNode(payload.type, payload.data, position);
    } catch {
      // ignore malformed drag data
    }
  }, [screenToFlowPosition, onDropNode]);

  return (
    <main className="canvas-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onNodeClick(node.id)}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onDragOver={onDragOver}
        onDrop={onDrop}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={minimapNodeColor}
          nodeStrokeColor={() => '#1a2744'}
          nodeBorderRadius={4}
          maskColor="rgba(9, 17, 31, 0.7)"
          style={{ background: '#0c1423' }}
        />
      </ReactFlow>
    </main>
  );
}

export default function Canvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
