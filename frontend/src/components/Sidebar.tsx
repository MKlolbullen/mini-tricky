import type { AppView, Health } from '../types';
import {
  DashboardIcon,
  BuilderIcon,
  LibraryIcon,
  TemplatesIcon,
  RunsIcon,
  SettingsIcon,
} from './Icons';

type Props = {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  health: Health | null;
};

const navItems: { key: AppView; label: string; Icon: (p: { size?: number }) => JSX.Element }[] = [
  { key: 'dashboard', label: 'Home', Icon: DashboardIcon },
  { key: 'builder', label: 'Builder', Icon: BuilderIcon },
  { key: 'library', label: 'Workflows', Icon: LibraryIcon },
  { key: 'templates', label: 'Templates', Icon: TemplatesIcon },
  { key: 'runs', label: 'Executions', Icon: RunsIcon },
  { key: 'settings', label: 'Settings', Icon: SettingsIcon },
];

export default function Sidebar({ activeView, onViewChange, health }: Props) {
  const online = health?.status === 'ok';
  return (
    <aside className="rail">
      <button className="rail-brand" onClick={() => onViewChange('dashboard')} title="mini-tricky">
        <span className="rail-brand-mark">mt</span>
      </button>

      <nav className="rail-nav">
        {navItems.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`rail-item ${activeView === key ? 'active' : ''}`}
            onClick={() => onViewChange(key)}
            title={label}
          >
            <span className="rail-item-icon">
              <Icon size={22} />
            </span>
            <span className="rail-item-label">{label}</span>
          </button>
        ))}
      </nav>

      <div className="rail-footer">
        <button
          className={`rail-status ${online ? 'ok' : 'warn'}`}
          onClick={() => onViewChange('settings')}
          title={online ? 'Backend online' : 'Backend offline'}
        >
          <span className="rail-status-dot" />
          <span className="rail-status-label">{online ? 'Online' : 'Offline'}</span>
        </button>
      </div>
    </aside>
  );
}
