// Lightweight inline SVG icon set — no dependency, crisp at any size,
// inherits `currentColor` so nav states style them via CSS.

type IconProps = { size?: number; className?: string };

function svg(path: React.ReactNode, size = 20, className?: string) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

export const DashboardIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>,
    size,
    className,
  );

export const BuilderIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <rect x="3" y="9" width="6" height="6" rx="1.5" />
      <rect x="15" y="4" width="6" height="6" rx="1.5" />
      <rect x="15" y="14" width="6" height="6" rx="1.5" />
      <path d="M9 12h3M12 12v-5h3M12 12v5h3" />
    </>,
    size,
    className,
  );

export const LibraryIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </>,
    size,
    className,
  );

export const TemplatesIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
      <path d="M3 17l9 5 9-5" opacity="0.55" />
    </>,
    size,
    className,
  );

export const RunsIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <path d="M3 12h4l2 6 4-14 2 8h6" />
    </>,
    size,
    className,
  );

export const SettingsIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>,
    size,
    className,
  );

export const PlusIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <path d="M12 5v14M5 12h14" />
    </>,
    size,
    className,
  );

export const PlayIcon = ({ size, className }: IconProps) =>
  svg(<path d="M6 4l14 8-14 8V4z" />, size, className);

export const SparkleIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
      <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
    </>,
    size,
    className,
  );

export const SearchIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>,
    size,
    className,
  );

export const TrashIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
      <path d="M10 11v6M14 11v6" />
    </>,
    size,
    className,
  );

export const CopyIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>,
    size,
    className,
  );

export const ClockIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
    size,
    className,
  );

export const UndoIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-5" />
    </>,
    size,
    className,
  );

export const RedoIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9a5 5 0 0 0 0 10h5" />
    </>,
    size,
    className,
  );

export const SaveIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </>,
    size,
    className,
  );

export const CheckIcon = ({ size, className }: IconProps) =>
  svg(<path d="M20 6L9 17l-5-5" />, size, className);

export const StopIcon = ({ size, className }: IconProps) =>
  svg(<rect x="6" y="6" width="12" height="12" rx="2" />, size, className);

export const CalendarIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </>,
    size,
    className,
  );

export const KeyIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3L21 2M16 7l3 3M13 10l3 3" />
    </>,
    size,
    className,
  );

export const NodesIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <circle cx="5" cy="6" r="2.5" />
      <circle cx="19" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M7 7l4 9M17 7l-4 9" />
    </>,
    size,
    className,
  );
