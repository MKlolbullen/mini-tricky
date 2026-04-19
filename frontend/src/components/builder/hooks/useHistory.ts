import { useCallback, useRef, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';

export type HistorySnapshot = {
  nodes: Node[];
  edges: Edge[];
};

const MAX_HISTORY = 100;

// Minimal ring-buffer history: push() drops the oldest entry when full.
// Callers push AFTER a structural change commits (node/edge add, delete,
// or settled drag position). undo()/redo() return the snapshot to apply.
export function useHistory(initial: HistorySnapshot) {
  const pastRef = useRef<HistorySnapshot[]>([]);
  const futureRef = useRef<HistorySnapshot[]>([]);
  // The "current" snapshot is stored outside React state — we only need
  // React re-renders for canUndo/canRedo badges.
  const currentRef = useRef<HistorySnapshot>(initial);
  const [version, setVersion] = useState(0);

  const push = useCallback((snap: HistorySnapshot) => {
    pastRef.current.push(currentRef.current);
    if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
    futureRef.current = [];
    currentRef.current = snap;
    setVersion((v) => v + 1);
  }, []);

  const undo = useCallback((): HistorySnapshot | null => {
    const prev = pastRef.current.pop();
    if (!prev) return null;
    futureRef.current.push(currentRef.current);
    currentRef.current = prev;
    setVersion((v) => v + 1);
    return prev;
  }, []);

  const redo = useCallback((): HistorySnapshot | null => {
    const next = futureRef.current.pop();
    if (!next) return null;
    pastRef.current.push(currentRef.current);
    currentRef.current = next;
    setVersion((v) => v + 1);
    return next;
  }, []);

  const replaceCurrent = useCallback((snap: HistorySnapshot) => {
    currentRef.current = snap;
  }, []);

  return {
    push,
    undo,
    redo,
    replaceCurrent,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    _version: version,
  };
}
