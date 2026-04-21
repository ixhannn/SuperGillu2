import { useMemo } from 'react';
import { RecapPalette } from '../types';

/**
 * Exposes a recap palette as CSS custom properties so children can style
 * against `var(--recap-base)` etc. The object is memoized so consumers can
 * spread it as `style={vars}` without triggering re-renders.
 */
export function useRecapPalette(palette: RecapPalette | null | undefined): {
  style: React.CSSProperties;
  palette: RecapPalette | null;
} {
  const style = useMemo<React.CSSProperties>(() => {
    if (!palette) return {};
    return {
      '--recap-base': palette.base,
      '--recap-accent': palette.accent,
      '--recap-vignette': palette.vignette,
      '--recap-text': palette.textOnBase,
      '--recap-muted': palette.muted,
      backgroundColor: palette.base,
      color: palette.textOnBase,
    } as React.CSSProperties;
  }, [palette]);

  return { style, palette: palette ?? null };
}
