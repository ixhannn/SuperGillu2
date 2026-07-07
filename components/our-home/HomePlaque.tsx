/**
 * OUR HOME — the plaque.
 *
 * Long-press an object and a paper tag unfurls: what it is, when it came home
 * (coarse warm time only), why it exists, the two-ink inscriptions, an optional
 * photo tucked behind. Never a modal — a tag pinned near the thing itself.
 */
import React, { useState } from 'react';
import { HomeInk, HomeObject, HomeSku } from './homeTypes';

export interface PlaqueMemoryChoice {
  id: string;
  label: string;
  href?: string;
}

export interface HomePlaqueProps {
  object: HomeObject;
  sku: HomeSku;
  /** Anchor within the scene container, in percent. */
  anchor: { leftPct: number; topPct: number };
  whenPhrase: string;
  myInk: HomeInk;
  nameFor: (key: string) => string;
  photoChoices: readonly PlaqueMemoryChoice[];
  onName: (nickname: string) => void;
  onInscribe: (text: string) => void;
  onPickPhoto: (memoryId: string | undefined) => void;
  onStore: () => void;
  onClose: () => void;
}

const INK_CSS: Record<HomeInk, string> = { wine: '#7a3b4a', gold: '#a97e3c' };

export const HomePlaque = ({
  object, sku, anchor, whenPhrase, myInk, nameFor, photoChoices,
  onName, onInscribe, onPickPhoto, onStore, onClose,
}: HomePlaqueProps): React.JSX.Element => {
  const [naming, setNaming] = useState(false);
  const [nick, setNick] = useState(object.nickname ?? '');
  const [line, setLine] = useState('');
  const [picking, setPicking] = useState(false);

  const canPhoto = sku.sku.includes('frame') || sku.sku === 'postcard';
  const left = Math.min(72, Math.max(4, anchor.leftPct - 20));
  const top = Math.min(66, Math.max(6, anchor.topPct - 30));

  return (
    <>
      <div className="oh-plaque-scrim" onPointerDown={onClose} />
      <div className="oh-plaque" style={{ left: `${left}%`, top: `${top}%` }}>
        <div className="oh-plaque-string" aria-hidden="true" />
        {naming ? (
          <input
            className="oh-plaque-name-input"
            value={nick}
            autoFocus
            maxLength={40}
            placeholder="call it something…"
            onChange={(e) => setNick(e.target.value)}
            onBlur={() => {
              setNaming(false);
              if (nick.trim() !== (object.nickname ?? '')) onName(nick);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          <button type="button" className="oh-plaque-title" onClick={() => setNaming(true)}>
            {object.nickname ?? sku.name}
          </button>
        )}

        <p className="oh-plaque-provenance">
          {object.provenance.label}
          <span className="oh-plaque-when"> · {whenPhrase}</span>
        </p>
        {object.placedTogether && (
          <p className="oh-plaque-together">placed together</p>
        )}

        {(object.lines ?? []).map((l) => (
          <p key={`${l.by}-${l.at}`} className="oh-plaque-line" style={{ color: INK_CSS[l.ink] }}>
            “{l.text}” <span className="oh-plaque-by">— {nameFor(l.by)}</span>
          </p>
        ))}

        <div className="oh-plaque-write">
          <input
            value={line}
            maxLength={90}
            placeholder="add a line…"
            style={{ color: INK_CSS[myInk] }}
            onChange={(e) => setLine(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && line.trim()) {
                onInscribe(line);
                setLine('');
              }
            }}
          />
          {line.trim() && (
            <button
              type="button"
              onClick={() => {
                onInscribe(line);
                setLine('');
              }}
            >
              keep
            </button>
          )}
        </div>

        {canPhoto && !picking && (
          <button type="button" className="oh-plaque-action" onClick={() => setPicking(true)}>
            {object.photoMemoryId ? 'change the photograph' : 'tuck a photograph behind'}
          </button>
        )}
        {picking && (
          <div className="oh-plaque-photos">
            {photoChoices.length === 0 && (
              <p className="oh-plaque-empty">no photographs yet — your memories will appear here</p>
            )}
            {photoChoices.map((m) => (
              <button
                key={m.id}
                type="button"
                className="oh-plaque-photo"
                onClick={() => {
                  onPickPhoto(m.id);
                  setPicking(false);
                }}
              >
                {m.href
                  ? <img src={m.href} alt="" loading="lazy" />
                  : <span>{m.label}</span>}
              </button>
            ))}
            {object.photoMemoryId && (
              <button
                type="button"
                className="oh-plaque-photo oh-plaque-photo-none"
                onClick={() => {
                  onPickPhoto(undefined);
                  setPicking(false);
                }}
              >
                <span>take it out</span>
              </button>
            )}
          </div>
        )}

        {!object.stored && (
          <button type="button" className="oh-plaque-action oh-plaque-store" onClick={onStore}>
            back to the cupboard
          </button>
        )}
      </div>
    </>
  );
};
