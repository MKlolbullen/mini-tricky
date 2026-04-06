import { useEffect, useState } from 'react';

export type Notification = {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  timestamp: number;
};

type Props = {
  notifications: Notification[];
  onDismiss: (id: string) => void;
};

const AUTO_DISMISS_MS = 8000;

export default function Notifications({ notifications, onDismiss }: Props) {
  return (
    <div className="notifications-container">
      {notifications.map((n) => (
        <NotificationToast key={n.id} notification={n} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function NotificationToast({ notification, onDismiss }: { notification: Notification; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(notification.id), 300);
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notification.id, onDismiss]);

  return (
    <div className={`notification-toast ${notification.type} ${exiting ? 'exiting' : ''}`}>
      <div className="notification-icon">{getIcon(notification.type)}</div>
      <div className="notification-body">
        <div className="notification-title">{notification.title}</div>
        <div className="notification-message">{notification.message}</div>
      </div>
      <button className="notification-close" onClick={() => { setExiting(true); setTimeout(() => onDismiss(notification.id), 300); }}>
        &times;
      </button>
    </div>
  );
}

function getIcon(type: string): string {
  switch (type) {
    case 'success': return '\u{2705}';
    case 'error': return '\u{274C}';
    case 'warning': return '\u{26A0}';
    default: return '\u{2139}';
  }
}
