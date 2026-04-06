import type { AppView, Health } from '../types';

type Props = {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  health: Health | null;
};

const views: { key: AppView; label: string }[] = [
  { key: 'builder', label: 'Builder' },
  { key: 'templates', label: 'Templates' },
  { key: 'runs', label: 'Runs' },
  { key: 'settings', label: 'Settings' },
];

export default function TopBar({ activeView, onViewChange, health }: Props) {
  return (
    <header className="topbar">
      <div className="brand">mini-tricky</div>
      <nav>
        {views.map((v) => (
          <button
            key={v.key}
            className={`nav-btn ${activeView === v.key ? 'active' : ''}`}
            onClick={() => onViewChange(v.key)}
          >
            {v.label}
          </button>
        ))}
      </nav>
      <div className={`status-pill ${health?.status === 'ok' ? 'ok' : 'warn'}`}>
        API: {health?.status || 'checking'}
      </div>
    </header>
  );
}
