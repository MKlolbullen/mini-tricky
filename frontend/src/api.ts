import type { Tool, WorkflowRecord, WorkflowVersion, RunRecord, TemplateRecord, ArtifactItem, ArtifactPreview, Health, WsEvent } from './types';

export const apiBase = (window as any).miniTrickyDesktop?.apiBase || 'http://127.0.0.1:5000';
const wsBase = apiBase.replace(/^http/, 'ws');

export async function fetchHealth(): Promise<Health> {
  const r = await fetch(`${apiBase}/api/health`);
  return r.json();
}

export async function fetchTools(): Promise<Tool[]> {
  const r = await fetch(`${apiBase}/api/tools`);
  return r.json();
}

export async function fetchWorkflows(): Promise<WorkflowRecord[]> {
  const r = await fetch(`${apiBase}/api/workflows`);
  return r.json();
}

export async function saveWorkflow(payload: { id?: string; name: string; graph: any }): Promise<WorkflowRecord> {
  const r = await fetch(`${apiBase}/api/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function validateGraph(graph: any): Promise<any> {
  const r = await fetch(`${apiBase}/api/workflows/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(graph),
  });
  return r.json();
}

export async function createRun(payload: { name: string; workflow: any; max_parallel: number }): Promise<RunRecord> {
  const r = await fetch(`${apiBase}/api/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function fetchRuns(): Promise<RunRecord[]> {
  const r = await fetch(`${apiBase}/api/runs`);
  return r.json();
}

export async function fetchRun(runId: string): Promise<RunRecord> {
  const r = await fetch(`${apiBase}/api/runs/${runId}`);
  return r.json();
}

export async function deleteRun(runId: string): Promise<any> {
  const r = await fetch(`${apiBase}/api/runs/${runId}`, { method: 'DELETE' });
  return r.json();
}

export async function cancelRun(runId: string): Promise<any> {
  const r = await fetch(`${apiBase}/api/runs/${runId}/cancel`, { method: 'POST' });
  return r.json();
}

export async function fetchRunArtifacts(runId: string): Promise<{ ok: boolean; items: ArtifactItem[] }> {
  const r = await fetch(`${apiBase}/api/runs/${runId}/artifacts`);
  return r.json();
}

export async function fetchArtifactPreview(runId: string, path: string): Promise<ArtifactPreview> {
  const r = await fetch(`${apiBase}/api/runs/${runId}/artifact-preview?path=${encodeURIComponent(path)}`);
  return r.json();
}

export function artifactRawUrl(runId: string, path: string): string {
  return `${apiBase}/api/runs/${runId}/artifact-raw?path=${encodeURIComponent(path)}`;
}

export async function replayNode(runId: string, nodeId: string): Promise<any> {
  const r = await fetch(`${apiBase}/api/runs/${runId}/replay/${nodeId}`, { method: 'POST' });
  return r.json();
}

export async function fetchTemplates(): Promise<TemplateRecord[]> {
  const r = await fetch(`${apiBase}/api/templates`);
  return r.json();
}

export async function fetchWorkflowVersions(workflowId: string): Promise<WorkflowVersion[]> {
  const r = await fetch(`${apiBase}/api/workflows/${workflowId}/versions`);
  return r.json();
}

export async function restoreWorkflowVersion(workflowId: string, version: number): Promise<WorkflowRecord> {
  const r = await fetch(`${apiBase}/api/workflows/${workflowId}/versions/${version}/restore`, { method: 'POST' });
  return r.json();
}

export async function saveAsTemplate(payload: { name: string; description: string; category: string; tags: string[]; graph: any }): Promise<TemplateRecord> {
  const r = await fetch(`${apiBase}/api/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.json();
}

// ── WebSocket streaming run ─────────────────────────────────

export function streamRun(
  payload: { name: string; workflow: any; max_parallel: number },
  onEvent: (event: WsEvent) => void,
  onClose?: () => void,
): { cancel: () => void } {
  const ws = new WebSocket(`${wsBase}/ws/run`);
  let closed = false;

  ws.onopen = () => {
    ws.send(JSON.stringify(payload));
  };

  ws.onmessage = (msg) => {
    try {
      const event: WsEvent = JSON.parse(msg.data);
      onEvent(event);
    } catch {
      // ignore parse errors
    }
  };

  ws.onclose = () => {
    closed = true;
    onClose?.();
  };

  ws.onerror = () => {
    if (!closed) ws.close();
  };

  return {
    cancel: () => {
      if (!closed) {
        try { ws.send(JSON.stringify({ type: 'cancel' })); } catch { /* ignore */ }
        ws.close();
      }
    },
  };
}

// ── Workflow Import/Export ───────────────────────────────────

export function exportWorkflow(workflow: WorkflowRecord): void {
  const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${workflow.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importWorkflow(file: File): Promise<WorkflowRecord> {
  const text = await file.text();
  return JSON.parse(text);
}
