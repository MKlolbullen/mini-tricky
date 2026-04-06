import { useCallback, useEffect, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { AppView, Health, Tool, WorkflowRecord, TemplateRecord } from './types';
import * as api from './api';
import TopBar from './components/TopBar';
import BuilderView from './components/builder/BuilderView';
import TemplatesView from './components/templates/TemplatesView';
import RunsView from './components/runs/RunsView';
import SettingsView from './components/settings/SettingsView';

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('builder');
  const [health, setHealth] = useState<Health | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [savedWorkflows, setSavedWorkflows] = useState<WorkflowRecord[]>([]);
  const [pendingTemplate, setPendingTemplate] = useState<TemplateRecord | null>(null);

  useEffect(() => {
    api.fetchHealth()
      .then(setHealth)
      .catch(() => setHealth({ status: 'offline' }));

    api.fetchTools()
      .then(setTools)
      .catch(() => setTools([]));

    refreshWorkflows();
  }, []);

  function refreshWorkflows() {
    api.fetchWorkflows()
      .then(setSavedWorkflows)
      .catch(() => setSavedWorkflows([]));
  }

  const handleUseTemplate = useCallback((template: TemplateRecord) => {
    setPendingTemplate(template);
    setActiveView('builder');
  }, []);

  const handleOpenInBuilder = useCallback((wf: WorkflowRecord) => {
    // Convert a run's graph into a template-like object to load into builder
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

  const handleTemplateClaimed = useCallback(() => {
    setPendingTemplate(null);
  }, []);

  return (
    <div className="app-shell">
      <TopBar activeView={activeView} onViewChange={setActiveView} health={health} />

      {activeView === 'builder' && (
        <BuilderView
          tools={tools}
          savedWorkflows={savedWorkflows}
          onRefreshWorkflows={refreshWorkflows}
          pendingTemplate={pendingTemplate}
          onTemplateClaimed={handleTemplateClaimed}
        />
      )}

      {activeView === 'templates' && (
        <TemplatesView onUseTemplate={handleUseTemplate} />
      )}

      {activeView === 'runs' && (
        <RunsView onOpenInBuilder={handleOpenInBuilder} />
      )}

      {activeView === 'settings' && (
        <SettingsView health={health} />
      )}
    </div>
  );
}
