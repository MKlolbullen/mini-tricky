import { Background, Controls, MiniMap, ReactFlow, type Connection, type Edge, type Node } from '@xyflow/react';
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
};

export default function Canvas({ nodes, edges, onNodesChange, onEdgesChange, onConnect, onNodeClick }: Props) {
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
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </main>
  );
}
