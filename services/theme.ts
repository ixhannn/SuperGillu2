
export type ThemeId = 'rose' | 'ocean' | 'forest' | 'sunset' | 'lavender' | 'midnight';

interface ThemePalette {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
}

export const THEMES: Record<ThemeId, { label: string; palette: ThemePalette }> = {
  rose: {
    label: 'Tulika Rose',
    palette: {
      50: '#fff1f2',
      100: '#ffe4e6',
      200: '#fecdd3',
      300: '#fda4af',
      400: '#fb7185',
      500: '#f43f5e',
      600: '#e11d48',
    }
  },
  ocean: {
    label: 'Ocean Blue',
    palette: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6',
      600: '#2563eb',
    }
  },
  forest: {
    label: 'Forest Green',
    palette: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      300: '#86efac',
      400: '#4ade80',
      500: '#22c55e',
      600: '#16a34a',
    }
  },
  sunset: {
    label: 'Sunset',
    palette: {
      50: '#fff7ed',
      100: '#ffedd5',
      200: '#fed7aa',
      300: '#fdba74',
      400: '#fb923c',
      500: '#f97316',
      600: '#ea580c',
    }
  },
  lavender: {
    label: 'Lavender',
    palette: {
      50: '#faf5ff',
      100: '#f3e8ff',
      200: '#e9d5ff',
      300: '#d8b4fe',
      400: '#c084fc',
      500: '#a855f7',
      600: '#9333ea',
    }
  },
  midnight: {
    label: 'Midnight',
    palette: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
    }
  }
};

export const ThemeService = {
  applyTheme: (themeId: string) => {
    const validId = (THEMES[themeId as ThemeId] ? themeId : 'rose') as ThemeId;
    const palette = THEMES[validId].palette;
    const root = document.documentElement;

    root.style.setProperty('--color-tulika-50', palette[50]);
    root.style.setProperty('--color-tulika-100', palette[100]);
    root.style.setProperty('--color-tulika-200', palette[200]);
    root.style.setProperty('--color-tulika-300', palette[300]);
    root.style.setProperty('--color-tulika-400', palette[400]);
    root.style.setProperty('--color-tulika-500', palette[500]);
    root.style.setProperty('--color-tulika-600', palette[600]);
    
    // Also update body background color to match the theme's lightest shade
    document.body.style.backgroundColor = palette[50];
  }
};
