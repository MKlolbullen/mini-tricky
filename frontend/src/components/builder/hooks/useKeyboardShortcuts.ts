import { useEffect } from 'react';

export type ShortcutHandlers = {
  onSave?: () => void;
  onRun?: () => void;
  onExport?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onSelectAll?: () => void;
};

// True when focus is inside a text input so typed characters never trigger
// global shortcuts. Monaco renders <textarea>-like elements, so this also
// shields the script editor.
function isEditingText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditingText(e.target)) return;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Ctrl/Cmd + key combinations
      if (mod) {
        switch (key) {
          case 's':
            if (handlers.onSave) { e.preventDefault(); handlers.onSave(); }
            return;
          case 'enter':
            if (handlers.onRun) { e.preventDefault(); handlers.onRun(); }
            return;
          case 'e':
            if (handlers.onExport) { e.preventDefault(); handlers.onExport(); }
            return;
          case 'z':
            if (e.shiftKey) {
              if (handlers.onRedo) { e.preventDefault(); handlers.onRedo(); }
            } else {
              if (handlers.onUndo) { e.preventDefault(); handlers.onUndo(); }
            }
            return;
          case 'y':
            if (handlers.onRedo) { e.preventDefault(); handlers.onRedo(); }
            return;
          case 'd':
            if (handlers.onDuplicate) { e.preventDefault(); handlers.onDuplicate(); }
            return;
          case 'a':
            if (handlers.onSelectAll) { e.preventDefault(); handlers.onSelectAll(); }
            return;
        }
      }

      // Bare keys
      if (!mod && (key === 'delete' || key === 'backspace')) {
        if (handlers.onDelete) { e.preventDefault(); handlers.onDelete(); }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers]);
}
