import { useCallback, type DragEvent } from 'react';
import { Background, Controls, MiniMap, ReactFlow, useReactFlow, MarkerType, type Connection, type Edge, type Node, type DefaultEdgeOptions } from '@xyflow/react';
import SocketNode from './SocketNode';
import type { WorkflowNodePayload } from '../../types';
import { CATEGORY_COLORS } from '../../types';

const nodeTypes = { socketNode: SocketNode };

const defaultEdgeOptions: DefaultEdgeOptions = {
  animated: true,
  style: { strokeWidth: 2, stroke: '#5bdcff88' },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#5bdcff', width: 16, height: 16 },
};

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

export default function Canvas({ nodes, edges, onNodesChange, onEdgesChange, onConnect, onNodeClick, onDropNode }: Props) {
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
