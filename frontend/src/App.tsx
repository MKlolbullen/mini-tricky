import { useCallback, useEffect, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { AppView, Health, Tool, WorkflowRecord, TemplateRecord } from './types';
import * as api from './api';
import Sidebar from './components/Sidebar';
import DashboardView from './components/dashboard/DashboardView';
import LibraryView from './components/library/LibraryView';
import BuilderView from './components/builder/BuilderView';
import TemplatesView from './components/templates/TemplatesView';
import RunsView, { type PendingRun } from './components/runs/RunsView';
import SettingsView from './components/settings/SettingsView';

const BLANK_GRAPH = { nodes: [], edges: [] };

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [health, setHealth] = useState<Health | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [savedWorkflows, setSavedWorkflows] = useState<WorkflowRecord[]>([]);
  const [pendingTemplate, setPendingTemplate] = useState<TemplateRecord | null>(null);
  const [pendingRun, setPendingRun] = useState<PendingRun | null>(null);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    api.fetchHealth().then(setHealth).catch(() => setHealth({ status: 'offline' }));
    api.fetchTools().then(setTools).catch(() => setTools([]));
    refreshWorkflows();
  }, []);

  function refreshWorkflows() {
    api.fetchWorkflows().then(setSavedWorkflows).catch(() => setSavedWorkflows([]));
  }

  const handleUseTemplate = useCallback((template: TemplateRecord) => {
    setPendingTemplate(template);
    setActiveView('builder');
  }, []);

  const openWorkflowInBuilder = useCallback((wf: WorkflowRecord) => {
    setPendingTemplate({
      id: wf.id,
      name: wf.name,
      description: '',
      category: '',
      tags: [],
      builtin: false,
      graph: wf.graph,
    });
    setActiveView('builder');
  }, []);

  const handleNewWorkflow = useCallback(() => {
    setPendingTemplate({
      id: `new-${Date.now()}`,
      name: 'Untitled workflow',
      description: '',
      category: '',
      tags: [],
      builtin: false,
      graph: BLANK_GRAPH,
    });
    setActiveView('builder');
  }, []);

  const handleRunWorkflow = useCallback((wf: WorkflowRecord) => {
    // Launch a live-streamed run and monitor it in the Executions view.
    setPendingRun({ name: wf.name || 'workflow', graph: wf.graph, maxParallel: 4 });
    setActiveView('runs');
  }, []);

  const handleDuplicateWorkflow = useCallback(async (wf: WorkflowRecord) => {
    await api.saveWorkflow({ name: `${wf.name || 'workflow'} (copy)`, graph: wf.graph });
    refreshWorkflows();
  }, []);

  const handleDeleteWorkflow = useCallback(async (wf: WorkflowRecord) => {
    if (!window.confirm(`Delete workflow "${wf.name || wf.id}"? This cannot be undone.`)) return;
    await api.deleteWorkflow(wf.id);
    refreshWorkflows();
  }, []);

  const handleTemplateClaimed = useCallback(() => {
    setPendingTemplate(null);
    refreshWorkflows();
  }, []);

  // Navigating away from Executions ends live monitoring so it can't restart.
  const handleViewChange = useCallback((view: AppView) => {
    setActiveView((prev) => {
      if (prev === 'runs' && view !== 'runs') setPendingRun(null);
      return view;
    });
  }, []);

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} onViewChange={handleViewChange} health={health} />

      <main className="app-main">
        {activeView === 'dashboard' && (
          <div className="view-scroll">
            <DashboardView
              workflows={savedWorkflows}
              health={health}
              onNewWorkflow={handleNewWorkflow}
              onGenerate={() => setActiveView('builder')}
              onBrowseTemplates={() => setActiveView('templates')}
              onOpenWorkflow={openWorkflowInBuilder}
              onOpenRuns={() => setActiveView('runs')}
              onViewLibrary={() => setActiveView('library')}
            />
          </div>
        )}

        {activeView === 'builder' && (
          <BuilderView
            tools={tools}
            savedWorkflows={savedWorkflows}
            onRefreshWorkflows={refreshWorkflows}
            pendingTemplate={pendingTemplate}
            onTemplateClaimed={handleTemplateClaimed}
          />
        )}

        {activeView === 'library' && (
          <div className="view-scroll">
            <LibraryView
              workflows={savedWorkflows}
              onOpen={openWorkflowInBuilder}
              onRun={handleRunWorkflow}
              onDuplicate={handleDuplicateWorkflow}
              onDelete={handleDeleteWorkflow}
              onNew={handleNewWorkflow}
            />
          </div>
        )}

        {activeView === 'templates' && (
          <div className="view-scroll">
            <TemplatesView onUseTemplate={handleUseTemplate} />
          </div>
        )}

        {activeView === 'runs' && (
          <div className="view-scroll">
            <RunsView
              onOpenInBuilder={openWorkflowInBuilder}
              pendingRun={pendingRun}
              onRunConsumed={() => setPendingRun(null)}
            />
          </div>
        )}

        {activeView === 'settings' && (
          <div className="view-scroll">
            <SettingsView health={health} />
          </div>
        )}
      </main>
    </div>
  );
}
