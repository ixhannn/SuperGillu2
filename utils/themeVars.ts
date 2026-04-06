const HEX_SHORT = /^#([0-9a-fA-F]{3})$/;
const HEX_LONG = /^#([0-9a-fA-F]{6})$/;
const RGB = /^rgba?\(([^)]+)\)$/;

export function readThemeVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || fallback;
}

function toRgbTriplet(color: string, fallback: string): string {
  const hexShort = color.match(HEX_SHORT);
  if (hexShort) {
    const [r, g, b] = hexShort[1].split('').map((c) => parseInt(c + c, 16));
    return `${r},${g},${b}`;
  }

  const hexLong = color.match(HEX_LONG);
  if (hexLong) {
    const value = hexLong[1];
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `${r},${g},${b}`;
  }

  const rgb = color.match(RGB);
  if (rgb) {
    const channels = rgb[1].split(',').map((part) => part.trim()).slice(0, 3);
    if (channels.length === 3) {
      return channels.join(',');
    }
  }

  return fallback;
}

export function readThemeRgbTriplet(name: string, fallback: string): string {
  return toRgbTriplet(readThemeVar(name, fallback), fallback);
}

export function readThemeColorList(name: string, fallback: string[]): string[] {
  const raw = readThemeVar(name, fallback.join(','));
  const values = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return values.length > 0 ? values : fallback;
}
