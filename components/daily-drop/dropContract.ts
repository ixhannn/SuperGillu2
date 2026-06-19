/**
 * dropContract.ts — the FROZEN interface every drop-type component is built to.
 *
 * The DailyDrop view owns state/storage and renders exactly one drop-type
 * component, driving it through three phases. Components are presentational:
 * they collect input (phase 'input'), show the locked-but-waiting recap (phase
 * 'waiting'), and show both answers + the match verdict (phase 'revealed').
 * They never touch storage directly — they only call `onSubmit`.
 */
import type { ComponentType } from 'react';
import type { DropPrompt, DropResponse, DropType, ViewState } from '../../types';

export type DropPhase =
  | 'input'      // collect my response
  | 'waiting'    // my response locked, partner's hidden
  | 'revealed';  // both responses visible + verdict

/** A resolved memory for the on_this_day drop type. */
export interface DropMemory {
  id: string;
  title: string;
  text?: string;
  imageId?: string;
  image?: string;
  date: string; // ISO
}

export interface DropTypeProps {
  prompt: DropPrompt;
  profile: { myName: string; partnerName: string };
  phase: DropPhase;
  /** My response, present in 'waiting' and 'revealed'. */
  myResponse?: DropResponse;
  /** Partner's response — ONLY provided in 'revealed'. Never leak it while sealed. */
  partnerResponse?: DropResponse;
  /** Disables the submit affordance while a write is in flight. */
  submitting?: boolean;
  /**
   * Commit my response. `value` is an option id / mood id / free text / 'pulsed';
   * `guess` is my guess of the partner's value (guess_my_mood, did_they_know).
   */
  onSubmit: (value: string, guess?: string) => void;
  /** Resolve a memory id for on_this_day (injected by the view). */
  resolveMemory?: (id: string) => DropMemory | null;
}

export type DropTypeComponent = ComponentType<DropTypeProps>;

export interface DailyDropCardProps {
  setView: (view: ViewState) => void;
}

export interface DailyDropRevealProps {
  type: DropType;
  /** Called when the unseal choreography finishes; the view then shows the revealed content. */
  onComplete: () => void;
}
