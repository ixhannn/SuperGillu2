/**
 * <SharedHero name> — shared-element morph via the View Transitions API
 * (Motion-OS §9.5.4).
 *
 * Gives its child a `view-transition-name` so the browser tweens that element
 * across a route commit — the visionOS / Photos "the thumbnail *becomes* the
 * detail" effect. The route layer (utils/TransitionEngine.ts) already runs the
 * native View Transitions API and the `expand` origin (hooks/useTileOpen.ts);
 * this primitive only tags the element. No framer `layoutId`, no main-thread
 * FLIP — the name rides the compositor.
 *
 * A shared element is achieved by giving the SAME `name` to the element on
 * BOTH the source and destination screen. Only ONE element may hold a given
 * name per document at a time — with keep-alive shells (two screens mounted),
 * the cached/hidden shell must NOT carry the name. Gate it with `active` (or
 * the `heroNameIf` helper) so the hidden shell drops the name.
 *
 * Graceful no-op: when View Transitions are unsupported (older WebView), the
 * `view-transition-name` style is simply inert — the element renders normally
 * and the route engine falls back to a plain push.
 *
 * @example
 * // Timeline thumbnail (source):
 * <SharedHero name={`memory-${memory.id}`}>
 *   <img src={memory.thumb} alt="" />
 * </SharedHero>
 * // Memory detail (destination) — same name → morph:
 * <SharedHero name={`memory-${memory.id}`} as="figure">
 *   <img src={memory.full} alt="" />
 * </SharedHero>
 *
 * @example
 * // Keep-alive safe: only the active shell carries the name.
 * <SharedHero name={heroNameIf(isActive, `tile-${tileKey}`) ?? ''}>...</SharedHero>
 */
import type { CSSProperties, ReactNode } from 'react';

/** Element tags <SharedHero> can render as. */
type SharedHeroTag = 'div' | 'span' | 'figure' | 'section' | 'header';

interface SharedHeroProps {
  /**
   * MUST be unique per logical element and identical on source + destination.
   * It is namespaced + sanitised internally (VT names can't contain spaces /
   * slashes). Pass an empty string to render with NO name (e.g. an inactive
   * keep-alive shell) — see `heroNameIf`.
   */
  name: string;
  children: ReactNode;
  /** Intrinsic element to render. Default `'div'`. */
  as?: SharedHeroTag;
  className?: string;
  style?: CSSProperties;
}

/**
 * Namespacing convention — keeps names collision-free and debuggable, and
 * strips characters illegal in a `view-transition-name`.
 */
export const vtName = (raw: string): string =>
  `lior-hero-${raw.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

/**
 * Apply a VT name only on the active shell to avoid duplicate-name aborts when
 * keep-alive shells keep two screens mounted at once.
 */
export const heroNameIf = (active: boolean, raw: string): string | undefined =>
  active ? vtName(raw) : undefined;

export function SharedHero({
  name,
  children,
  as = 'div',
  className,
  style,
}: SharedHeroProps) {
  // Empty name → no VT name (graceful: the element is a plain container).
  // `viewTransitionName` is a real CSS prop in Chromium 111+ WebView (our
  // target); on unsupported engines it is ignored and the element renders
  // normally, so this is a safe no-op everywhere.
  const heroStyle: CSSProperties = name
    ? { ...style, viewTransitionName: vtName(name) }
    : { ...style };

  const Tag = as;
  return (
    <Tag className={className} style={heroStyle}>
      {children}
    </Tag>
  );
}
