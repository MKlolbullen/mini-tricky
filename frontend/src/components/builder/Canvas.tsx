import { useCallback, type DragEvent } from 'react';
import { Background, Controls, MiniMap, ReactFlow, useReactFlow, type Connection, type Edge, type Node } from '@xyflow/react';
import SocketNode from './SocketNode';
import type { WorkflowNodePayload } from '../../types';

const nodeTypes = { socketNode: SocketNode };

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
        <MiniMap />
      </ReactFlow>
    </main>
  );
}
