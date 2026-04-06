import type { Node } from '@xyflow/react';

export type Tool = {
  id: string;
  name: string;
  category: string;
  description?: string;
  icon?: string;
  inputs: string[];
  outputs: string[];
  command?: string[];
  timeout_seconds?: number;
};

export type Health = { status: string };

export type WorkflowNodePayload = {
  kind: 'tool' | 'variable' | 'output' | 'script' | 'module' | 'condition' | 'loop';
  label: string;
  toolId?: string;
  variableType?: string;
  inputs: string[];
  outputs: string[];
  value?: string;
  params?: Record<string, string>;
  runState?: string;
  category?: string;
  scriptLanguage?: 'bash' | 'python';
  scriptBody?: string;
  moduleWorkflowId?: string;
  conditionExpr?: string; // For condition nodes: expression to evaluate
  loopMode?: 'line' | 'chunk'; // For loop nodes: iterate per-line or per-chunk
};

export type WsEvent =
  | { type: 'run_started'; run_id: string; node_states: Record<string, string> }
  | { type: 'node_started'; run_id: string; node_id: string }
  | { type: 'node_log'; run_id: string; node_id: string; line: string }
  | { type: 'node_finished'; run_id: string; node_id: string; status: string; result: NodeRunResult }
  | { type: 'run_finished'; run_id: string; status: string; run: RunRecord }
  | { type: 'run_error'; run_id: string; error: string };

export type WorkflowRecord = {
  id: string;
  name: string;
  version?: number;
  graph: {
    nodes: Array<{
      id: string;
      kind: 'tool' | 'variable' | 'output' | 'script' | 'module' | 'condition' | 'loop';
      label: string;
      tool_id?: string | null;
      variable_type?: string | null;
      value?: string | null;
      params?: Record<string, string> | null;
      position?: { x: number; y: number };
      script_language?: string | null;
      script_body?: string | null;
      module_workflow_id?: string | null;
      condition_expr?: string | null;
      loop_mode?: string | null;
    }>;
    edges: Array<{
      id?: string;
      source: string;
      target: string;
      source_handle?: string | null;
      target_handle?: string | null;
    }>;
  };
};

export type WorkflowVersion = {
  version: number;
  updated_at: string;
  name: string;
  node_count: number;
  edge_count: number;
};

export type NodeRunResult = {
  node_id: string;
  status: string;
  command: string[];
  exit_code: number | null;
  artifact_paths: string[];
  outputs: Record<string, string>;
  stdout_preview: string;
  stderr_preview: string;
  stdout_path: string;
  stderr_path: string;
  logs: string[];
};

export type ReplayRecord = {
  id: string;
  node_id: string;
  created_at: string;
  used_cached_upstream_from: string[];
  result: NodeRunResult;
};

export type ReplayResponse = {
  ok: boolean;
  run_id: string;
  replay_id: string;
  node_id: string;
  parent_ids: string[];
  cached_output_nodes: string[];
  result: NodeRunResult;
  error?: string;
};

export type RunRecord = {
  id: string;
  workflow_id: string | null;
  name: string;
  status: string;
  created_at?: string;
  parallel_groups: string[][];
  node_states: Record<string, string>;
  node_results: Record<string, NodeRunResult>;
  artifact_root: string;
  replays?: ReplayRecord[];
  logs: string[];
  graph?: WorkflowRecord['graph'];
};

export type ArtifactItem = {
  id: string;
  source: 'run' | 'replay';
  node_id: string;
  replay_id?: string;
  label: string;
  path: string;
  name: string;
  extension: string;
  size_bytes: number;
};

export type ArtifactPreview =
  | { ok: true; kind: 'text'; path: string; name: string; mime_type: string; size_bytes: number; text_content: string }
  | { ok: true; kind: 'json'; path: string; name: string; mime_type: string; size_bytes: number; json_content: unknown }
  | { ok: true; kind: 'html'; path: string; name: string; mime_type: string; size_bytes: number; html_content: string }
  | { ok: true; kind: 'image'; path: string; name: string; mime_type: string; size_bytes: number; image_data_url: string }
  | { ok: true; kind: 'binary'; path: string; name: string; mime_type: string; size_bytes: number }
  | { ok: false; error: string };

export type TemplateRecord = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  builtin: boolean;
  graph: WorkflowRecord['graph'];
};

export type AppView = 'builder' | 'templates' | 'runs' | 'settings';

export type FlowNode = Node<WorkflowNodePayload>;

export const CATEGORY_COLORS: Record<string, string> = {
  Recon: '#5b8cff',
  Enumeration: '#7c6cff',
  Vulnerability: '#ff5b6c',
  Fuzzing: '#ff9f43',
  Crawling: '#43d9ad',
  Network: '#b47cff',
  OSINT: '#ffcf5b',
  Archive: '#8fa5d2',
  Utility: '#6bc5e8',
};

export const CATEGORY_ICONS: Record<string, string> = {
  Recon: '\u{1F50D}',
  Enumeration: '\u{1F4C2}',
  Vulnerability: '\u{1F6E1}',
  Fuzzing: '\u{1F4A5}',
  Crawling: '\u{1F578}',
  Network: '\u{1F310}',
  OSINT: '\u{1F441}',
  Archive: '\u{1F4DA}',
  Utility: '\u{1F527}',
};

export const variableCatalog = [
  { label: 'Domain Input', type: 'domain' },
  { label: 'Target List', type: 'targets' },
  { label: 'Wordlist', type: 'wordlist' },
];

export const outputCatalog = [{ label: 'Artifacts', type: 'any' }];
