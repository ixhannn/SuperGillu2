import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CocoApp } from './CocoApp.jsx';
import cocoPetCss from './coco-pet.css?raw';

interface CocoPetOverlayProps {
  onClose?: () => void;
  mode?: 'overlay' | 'page';
}

const FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');";

const makeShadowCss = () => {
  const scopedVars = cocoPetCss.replace(/:root\s*\{/, ':host {');
  return `
${FONT_IMPORT}
${scopedVars}
:host {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  justify-content: center;
  background: rgba(31, 12, 20, 0.42);
  font-family: 'Inter', system-ui, sans-serif;
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}
:host([data-coco-pet-page="true"]) {
  z-index: 65;
  background: transparent;
  padding: 0;
  align-items: stretch;
}
.coco-pet-root {
  width: 100%;
  max-width: 430px;
  height: 100dvh;
  min-height: 100dvh;
  display: flex;
  justify-content: center;
}
.screen {
  width: 100%;
  height: 100dvh;
  max-height: none;
  border-radius: 0;
  box-shadow: none;
  font-family: 'Inter', system-ui, sans-serif;
}
:host([data-coco-pet-page="true"]) .coco-pet-root {
  margin: 0 auto;
  max-width: 430px;
}
:host([data-coco-pet-page="true"]) .screen {
  height: 100dvh;
  max-height: none;
  border-radius: 0;
  box-shadow: none;
}
.topbar {
  padding-top: max(env(safe-area-inset-top, 0px), 14px);
}
.actionbar {
  padding-bottom: max(env(safe-area-inset-bottom, 0px), 14px);
}
@media (min-width: 500px) {
  :host {
    align-items: center;
    padding: 10px 0;
  }
  :host([data-coco-pet-page="true"]) {
    align-items: stretch;
    padding: 0;
  }
  .coco-pet-root {
    height: min(844px, calc(100vh - 20px));
    min-height: 0;
  }
  :host([data-coco-pet-page="true"]) .coco-pet-root {
    height: 100dvh;
    min-height: 100dvh;
  }
  .screen {
    height: 100%;
    border-radius: 44px;
    box-shadow:
      0 30px 70px rgba(80, 20, 40, 0.36),
      0 0 0 1px rgba(74, 31, 44, 0.22),
      inset 0 1px 0 rgba(255,255,255,0.5);
  }
  :host([data-coco-pet-page="true"]) .screen {
    height: 100dvh;
    border-radius: 0;
    box-shadow: none;
  }
}
`;
};

export const CocoPetOverlay: React.FC<CocoPetOverlayProps> = ({ onClose, mode = 'overlay' }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const css = useMemo(makeShadowCss, []);

  useLayoutEffect(() => {
    setPortalTarget(document.body);
    return () => setPortalTarget(null);
  }, []);

  useLayoutEffect(() => {
    if (!portalTarget) return;
    const host = hostRef.current;
    if (!host) return;

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = css;
    shadow.appendChild(style);

    const mount = document.createElement('div');
    mount.className = 'coco-pet-root';
    shadow.appendChild(mount);
    setMountNode(mount);

    return () => {
      setMountNode(null);
      shadow.innerHTML = '';
    };
  }, [css, portalTarget]);

  useEffect(() => {
    const onHardwareBack = (event: Event) => {
      event.preventDefault();
      onClose?.();
    };
    window.addEventListener('lior:hardware-back', onHardwareBack);
    return () => window.removeEventListener('lior:hardware-back', onHardwareBack);
  }, [onClose]);

  useEffect(() => {
    if (mode !== 'overlay') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mode]);

  const host = (
    <div
      ref={hostRef}
      data-coco-pet-overlay={mode === 'overlay' ? 'true' : undefined}
      data-coco-pet-page={mode === 'page' ? 'true' : undefined}
      data-coco-pet-route-host="true"
    >
      {mountNode ? createPortal(<CocoApp onClose={onClose} />, mountNode) : null}
    </div>
  );

  return portalTarget ? createPortal(host, portalTarget) : null;
};
