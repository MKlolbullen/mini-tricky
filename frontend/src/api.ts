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

// ── Tool Health / Bootstrap ─────────────────────────────────

export type ToolHealth = {
  id: string; name: string; category: string; binary: string | null;
  installed: boolean; path: string | null; hint: string;
};

export async function fetchToolsHealth(): Promise<{ ok: boolean; total: number; installed: number; missing: number; tools: ToolHealth[] }> {
  const r = await fetch(`${apiBase}/api/tools/health`);
  return r.json();
}

export async function fetchInstallScript(): Promise<string> {
  const r = await fetch(`${apiBase}/api/tools/install-script`);
  if (!r.ok) throw new Error(`install-script fetch failed: ${r.status}`);
  return r.text();
}

// ── Environment Profiles ────────────────────────────────────

export type Profile = {
  id: string; name: string; description: string;
  tool_overrides: Record<string, Record<string, string>>;
  env_vars: Record<string, string>;
  created_at: string;
};

export async function fetchProfiles(): Promise<Profile[]> {
  const r = await fetch(`${apiBase}/api/profiles`);
  return r.json();
}

export async function saveProfile(payload: { name: string; description: string; tool_overrides: Record<string, Record<string, string>>; env_vars: Record<string, string> }): Promise<Profile> {
  const r = await fetch(`${apiBase}/api/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function deleteProfile(profileId: string): Promise<any> {
  const r = await fetch(`${apiBase}/api/profiles/${profileId}`, { method: 'DELETE' });
  return r.json();
}

// ── Normalized Results ──────────────────────────────────────

export async function fetchNormalizedResults(runId: string): Promise<any> {
  const r = await fetch(`${apiBase}/api/runs/${runId}/normalized`);
  return r.json();
}

// ── Report Export ───────────────────────────────────────────

export function reportDownloadUrl(runId: string, format: string = 'markdown'): string {
  return `${apiBase}/api/runs/${runId}/report?fmt=${format}`;
}

// ── Parameter Presets ───────────────────────────────────────

export type Preset = { id: string; tool_id: string; name: string; params: Record<string, string>; created_at: string };

export async function fetchPresets(toolId?: string): Promise<Preset[]> {
  const url = toolId ? `${apiBase}/api/presets?tool_id=${encodeURIComponent(toolId)}` : `${apiBase}/api/presets`;
  const r = await fetch(url);
  return r.json();
}

export async function savePreset(payload: { tool_id: string; name: string; params: Record<string, string> }): Promise<Preset> {
  const r = await fetch(`${apiBase}/api/presets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function deletePreset(presetId: string): Promise<any> {
  const r = await fetch(`${apiBase}/api/presets/${presetId}`, { method: 'DELETE' });
  return r.json();
}

// ── AI Workflow Generation ──────────────────────────────────

export async function generateWorkflow(prompt: string, scope: string = ''): Promise<any> {
  const r = await fetch(`${apiBase}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, scope }),
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
