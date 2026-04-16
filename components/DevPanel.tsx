/**
 * DevPanel — Temporary dev tool panel.
 *
 * Only visible when import.meta.env.DEV is true.
 * Tap the wrench icon (bottom-left) to expand the panel.
 *
 * Available actions are passed in as props from App.tsx so
 * DevPanel never needs to import App internals.
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';

interface DevAction {
  label: string;
  action: () => void;
  danger?: boolean;
}

interface DevPanelProps {
  actions: DevAction[];
}

export const DevPanel: React.FC<DevPanelProps> = ({ actions }) => {
  const [open, setOpen] = useState(false);

  const ui = (
    <>
      {/* Action menu */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: '120px',
          left: '12px',
          zIndex: 2147483647,
          background: 'rgba(0,0,0,0.95)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '12px',
          padding: '10px',
          minWidth: '190px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          fontFamily: 'monospace',
          userSelect: 'none',
        }}>
          <div style={{ fontSize: '9px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>
            DEV TOOLS
          </div>
          {actions.map(({ label, action, danger }) => (
            <button
              key={label}
              onClick={() => { action(); setOpen(false); }}
              style={{
                background: danger ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${danger ? 'rgba(220,38,38,0.4)' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: '6px',
                color: danger ? '#fca5a5' : '#f1f5f9',
                fontSize: '11px',
                fontFamily: 'monospace',
                padding: '7px 10px',
                textAlign: 'left',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'block',
                width: '100%',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed',
          bottom: '72px',
          left: '12px',
          zIndex: 2147483647,
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          background: open ? '#fbbf24' : '#1e1e1e',
          border: '2px solid rgba(255,255,255,0.3)',
          color: open ? '#000' : '#fff',
          fontSize: '18px',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          userSelect: 'none',
        }}
        title="Dev Panel"
      >
        {open ? 'X' : '#'}
      </button>
    </>
  );

  return createPortal(ui, document.body);
};
