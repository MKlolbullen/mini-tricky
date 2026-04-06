type Props = {
  consoleTab: 'stdout' | 'stderr' | 'stdin' | 'artifacts';
  onTabChange: (tab: 'stdout' | 'stderr' | 'stdin' | 'artifacts') => void;
  stdoutView: string;
  stderrView: string;
  artifactsView: string;
};

const tabs = ['stdout', 'stderr', 'stdin', 'artifacts'] as const;

export default function Console({ consoleTab, onTabChange, stdoutView, stderrView, artifactsView }: Props) {
  return (
    <section className="console">
      <div className="console-tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`console-tab ${consoleTab === tab ? 'active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>
      <pre className="console-output">
        {consoleTab === 'stdout' && stdoutView}
        {consoleTab === 'stderr' && stderrView}
        {consoleTab === 'stdin' && '[>] No interactive stdin handling yet.'}
        {consoleTab === 'artifacts' && artifactsView}
      </pre>
    </section>
  );
}
