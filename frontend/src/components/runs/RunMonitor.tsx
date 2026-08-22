import { useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../../api';
import type { RunRecord, WsEvent } from '../../types';
import { StopIcon, CheckIcon, NodesIcon } from '../Icons';

type GraphNode = { id: string; kind: string; label: string; tool_id?: string | null };

type Props = {
  name: string;
  graph: { nodes: GraphNode[]; edges: unknown[] };
  maxParallel: number;
  onClose: () => void;
  onFinished: (run: RunRecord | null) => void;
};

type Status = 'running' | 'completed' | 'failed';

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function stateClass(s: string | undefined): string {
  if (s === 'success' || s === 'completed') return 'ok';
  if (s === 'failed' || s === 'blocked') return 'fail';
  if (s === 'running') return 'run';
  if (s === 'queued') return 'queued';
  return 'idle';
}

export default function RunMonitor({ name, graph, maxParallel, onClose, onFinished }: Props) {
  const nodes = graph.nodes || [];
  const [nodeStates, setNodeStates] = useState<Record<string, string>>(
    () => Object.fromEntries(nodes.map((n) => [n.id, 'queued'])),
  );
  const [nodeLogs, setNodeLogs] = useState<Record<string, string[]>>({});
  const [allLogs, setAllLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>('running');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const startRef = useRef<number>(Date.now());
  const cancelRef = useRef<(() => void) | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  // Launch the streaming run once on mount.
  useEffect(() => {
    startRef.current = Date.now();
    const { cancel } = api.streamRun(
      { name, workflow: graph, max_parallel: maxParallel },
      (event: WsEvent) => {
        switch (event.type) {
          case 'run_started':
            setNodeStates((cur) => ({ ...cur, ...event.node_states }));
            break;
          case 'node_started':
            setNodeStates((cur) => ({ ...cur, [event.node_id]: 'running' }));
            setAllLogs((prev) => [...prev, `[>] ${event.node_id} running…`]);
            break;
          case 'node_log':
            setNodeLogs((cur) => ({ ...cur, [event.node_id]: [...(cur[event.node_id] || []), event.line] }));
            setAllLogs((prev) => [...prev, event.line]);
            break;
          case 'node_finished':
            setNodeStates((cur) => ({ ...cur, [event.node_id]: event.status }));
            setNodeLogs((cur) => ({
              ...cur,
              [event.node_id]: [...(cur[event.node_id] || []), ...(event.result.logs || [])],
            }));
            setAllLogs((prev) => [...prev, ...(event.result.logs || [])]);
            break;
          case 'run_finished':
            setStatus(event.status === 'completed' ? 'completed' : 'failed');
            if (event.run?.node_states) setNodeStates(event.run.node_states);
            cancelRef.current = null;
            onFinished(event.run);
            break;
          case 'run_error':
            setStatus('failed');
            setAllLogs((prev) => [...prev, `[-] Run error: ${event.error}`]);
            cancelRef.current = null;
            onFinished(null);
            break;
        }
      },
      () => {
        cancelRef.current = null;
      },
    );
    cancelRef.current = cancel;
    return () => {
      if (cancelRef.current) cancelRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Elapsed timer while running.
  useEffect(() => {
    if (status !== 'running') return;
    const id = window.setInterval(() => setElapsedMs(Date.now() - startRef.current), 500);
    return () => window.clearInterval(id);
  }, [status]);

  // Auto-scroll the log stream.
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [allLogs, selectedNode]);

  const counts = useMemo(() => {
    let running = 0, done = 0, failed = 0, queued = 0;
    for (const s of Object.values(nodeStates)) {
      if (s === 'running') running += 1;
      else if (s === 'success' || s === 'completed') done += 1;
      else if (s === 'failed' || s === 'blocked') failed += 1;
      else if (s === 'queued') queued += 1;
    }
    return { running, done, failed, queued, total: nodes.length };
  }, [nodeStates, nodes.length]);

  const pct = counts.total > 0 ? Math.round(((counts.done + counts.failed) / counts.total) * 100) : 0;
  const shownLogs = selectedNode ? nodeLogs[selectedNode] || ['No output for this node yet.'] : allLogs;

  function handleStop() {
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    setStatus('failed');
    setAllLogs((prev) => [...prev, '[!] Run cancelled by user.']);
  }

  return (
    <div className="run-monitor">
      <div className="rm-header">
        <div className="rm-title-group">
          <button className="link-btn" onClick={onClose}>&larr; Executions</button>
          <h2 className="rm-title">{name}</h2>
          <span className={`status-badge ${status}`}>{status}</span>
        </div>
        <div className="rm-header-actions">
          <span className="rp-timer">{fmtElapsed(elapsedMs)}</span>
          {status === 'running' ? (
            <button className="btn btn-sm tb-stop" onClick={handleStop}>
              <StopIcon size={14} /> Stop
            </button>
          ) : (
            <button className="btn btn-sm" onClick={onClose}>Done</button>
          )}
        </div>
      </div>

      <div className="rm-progress">
        <div className="rp-bar">
          <div className={`rp-fill ${counts.failed > 0 ? 'has-fail' : ''}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="rp-stats">
          <span className="rp-stat"><b>{counts.done + counts.failed}</b>/{counts.total} nodes</span>
          {counts.running > 0 && <span className="rp-stat running">{counts.running} running</span>}
          {counts.queued > 0 && <span className="rp-stat queued">{counts.queued} queued</span>}
          {counts.done > 0 && <span className="rp-stat ok">{counts.done} done</span>}
          {counts.failed > 0 && <span className="rp-stat fail">{counts.failed} failed</span>}
        </div>
      </div>

      <div className="rm-body">
        {/* Node status tree */}
        <div className="rm-tree">
          <div className="rm-tree-head">
            <NodesIcon size={14} /> Nodes
          </div>
          <button
            className={`rm-node ${selectedNode === null ? 'active' : ''}`}
            onClick={() => setSelectedNode(null)}
          >
            <span className="rm-node-glyph all">≡</span>
            <span className="rm-node-label">All output</span>
          </button>
          {nodes.map((n) => {
            const st = nodeStates[n.id];
            return (
              <button
                key={n.id}
                className={`rm-node ${selectedNode === n.id ? 'active' : ''}`}
                onClick={() => setSelectedNode(n.id)}
              >
                <span className={`rm-node-glyph ${stateClass(st)}`}>
                  {st === 'running' ? (
                    <span className="node-spinner" />
                  ) : st === 'success' || st === 'completed' ? (
                    <CheckIcon size={12} />
                  ) : st === 'failed' || st === 'blocked' ? (
                    '✗'
                  ) : (
                    ''
                  )}
                </span>
                <span className="rm-node-label">{n.label || n.id}</span>
                <span className={`rm-node-state ${stateClass(st)}`}>{st}</span>
              </button>
            );
          })}
        </div>

        {/* Live log stream */}
        <div className="rm-logs">
          <div className="rm-logs-head">
            {selectedNode ? `Output · ${nodes.find((n) => n.id === selectedNode)?.label || selectedNode}` : 'Live output'}
          </div>
          <div className="rm-logs-body">
            <pre>{shownLogs.join('\n')}</pre>
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
