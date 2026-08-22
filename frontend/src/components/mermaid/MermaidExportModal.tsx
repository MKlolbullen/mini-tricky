import { useState } from 'react';
import { CheckIcon, CopyIcon } from '../Icons';

type Props = {
  mermaid: string;
  title?: string;
  onClose: () => void;
};

export default function MermaidExportModal({ mermaid, title, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(mermaid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal mermaid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Export as Mermaid{title ? ` · ${title}` : ''}</h2>
          <button className="notification-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="mermaid-hint">
            Paste this into any Mermaid renderer (GitHub, docs, mermaid.live), or back into
            <strong> Import from Mermaid</strong> to recreate the workflow. Edge labels show the socket type.
          </div>
          <textarea className="form-input mono mermaid-input" rows={14} value={mermaid} readOnly spellCheck={false} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={copy}>
            {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
