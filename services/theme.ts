
export type ThemeId = 'rose' | 'baby-pink' | 'warm-beige' | 'teal' | 'ocean' | 'rosewood' | 'sunset' | 'lavender' | 'starry-night';

interface ThemePalette {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
}

interface ThemeVisualTokens {
  base: string;
  surface: string;
  glass: string;
  textPrimary: string;
  textSecondary: string;
  navActive: string;
  navInactive: string;
  bgMain: string;
  bgOverlay: string;
  progressGradient: string;
  vignette: string;
  navGlassBg: string;
  navGlassBorder: string;
  navGlassShadow: string;
  navGlassHighlight: string;
  navIconActive: string;
  navIconInactive: string;
  navLabel: string;
  navPillBg: string;
  navPillBorder: string;
  navPillShadow: string;
  navCenterBgActive: string;
  navCenterBgInactive: string;
  navCenterShadowActive: string;
  navCenterShadowInactive: string;
  orb1: string;
  orb2: string;
  orb3: string;
  starLinkRgb: string;
  starCoreRgb: string;
  partnerA: string;
  partnerB: string;
  particle1: string;
  particle2: string;
  particle3: string;
  particle4: string;
  particle5: string;
  heartA: string;
  heartB: string;
  resonanceA: string;
  resonanceB: string;
  live3DBokeh: string;
  live3DSparkle: string;
  floatingRim: string;
  floatingAccent: string;
  floatingDust: string;
  floatingLightA: string;
  floatingLightB: string;
  shadowXs: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  shadowFloat: string;
}

interface ThemeDefinition {
  label: string;
  palette: ThemePalette;
  tokens: ThemeVisualTokens;
}

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  rose: {
    label: 'Tulika Rose',
    palette: {
      50: '#fff0f3',
      100: '#ffdde8',
      200: '#ffc5d4',
      300: '#ff9db8',
      400: '#f7708f',
      500: '#e8365a',
      600: '#c41840',
    },
    tokens: {
      base: '#FEFBFC',
      surface: '#FFF5F8',
      glass: 'rgba(255, 244, 249, 0.74)',
      textPrimary: '#2D1F25',
      textSecondary: '#9B7B84',
      navActive: '#C4687E',
      navInactive: '#C4B5BA',
      bgMain: 'linear-gradient(168deg, #FFF2F5 0%, #F9E0E8 30%, #EED0DC 60%, #E4BFCC 100%)',
      bgOverlay: 'linear-gradient(168deg, rgba(255, 242, 245, 0.5) 0%, rgba(243, 222, 232, 0.25) 100%)',
      progressGradient: 'linear-gradient(90deg, #e8365a, #f7708f, #c41840)',
      vignette: 'radial-gradient(ellipse 120% 80% at 50% -10%, rgba(251,207,232,0.14) 0%, transparent 60%), radial-gradient(ellipse 80% 50% at 30% 50%, rgba(249,168,212,0.08) 0%, transparent 50%), radial-gradient(ellipse 100% 60% at 50% 110%, rgba(251,207,232,0.10) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 70% 30%, rgba(244,114,182,0.05) 0%, transparent 50%)',
      navGlassBg: 'linear-gradient(135deg, rgba(232,160,176,0.15) 0%, rgba(255,255,255,0.95) 50%, rgba(232,160,176,0.12) 100%)',
      navGlassBorder: 'rgba(255,255,255,0.8)',
      navGlassShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(255,255,255,0.4), 0 8px 32px rgba(232,160,176,0.25), 0 2px 8px rgba(232,160,176,0.1)',
      navGlassHighlight: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.8) 30%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.8) 70%, transparent 100%)',
      navIconActive: 'rgba(75, 85, 99, 0.95)',
      navIconInactive: 'rgba(107, 114, 128, 0.45)',
      navLabel: 'rgba(75, 85, 99, 0.9)',
      navPillBg: 'rgba(0,0,0,0.03)',
      navPillBorder: 'rgba(0,0,0,0.04)',
      navPillShadow: 'inset 0 1px 0 rgba(0,0,0,0.02), 0 2px 8px rgba(232,160,176,0.1)',
      navCenterBgActive: 'linear-gradient(135deg, #e8365a 0%, #c41840 100%)',
      navCenterBgInactive: 'linear-gradient(135deg, rgba(232,54,90,0.85) 0%, rgba(196,24,64,0.85) 100%)',
      navCenterShadowActive: '0 4px 20px rgba(255,157,184,0.38), 0 2px 8px rgba(232,54,90,0.24), inset 0 1px 0 rgba(255,255,255,0.25)',
      navCenterShadowInactive: '0 4px 16px rgba(255,157,184,0.22), inset 0 1px 0 rgba(255,255,255,0.2)',
      orb1: 'radial-gradient(circle, rgba(251,207,232,0.20) 0%, rgba(244,114,182,0.06) 50%, transparent 70%)',
      orb2: 'radial-gradient(circle, rgba(249,168,212,0.16) 0%, rgba(251,207,232,0.05) 50%, transparent 70%)',
      orb3: 'radial-gradient(circle, rgba(251,207,232,0.14) 0%, rgba(244,114,182,0.04) 50%, transparent 70%)',
      starLinkRgb: '253,164,175',
      starCoreRgb: '253,164,175',
      partnerA: '244,63,94',
      partnerB: '251,191,36',
      particle1: '251,113,133',
      particle2: '253,164,175',
      particle3: '254,205,211',
      particle4: '249,168,212',
      particle5: '255,228,230',
      heartA: '251,207,232',
      heartB: '251,113,133',
      resonanceA: '244,63,94',
      resonanceB: '251,191,36',
      live3DBokeh: '#f472b6,#ec4899,#db2777,#be185d,#9d174d',
      live3DSparkle: '#f472b6,#ec4899,#db2777,#ffffff',
      floatingRim: '#fbcfe8',
      floatingAccent: '#fda4af',
      floatingDust: '#d4c5a9',
      floatingLightA: '#f5e6d3',
      floatingLightB: '#ffffff',
      shadowXs: '0 4px 12px rgba(232, 160, 176, 0.05)',
      shadowSm: '0 8px 24px rgba(232, 160, 176, 0.08), 0 2px 8px rgba(232, 160, 176, 0.04)',
      shadowMd: '0 16px 40px rgba(232, 160, 176, 0.12), 0 4px 12px rgba(232, 160, 176, 0.06)',
      shadowLg: '0 32px 64px rgba(232, 160, 176, 0.16), 0 8px 24px rgba(232, 160, 176, 0.08)',
      shadowFloat: '0 40px 80px rgba(232, 160, 176, 0.20), 0 12px 36px rgba(232, 160, 176, 0.10), 0 4px 12px rgba(232, 160, 176, 0.06)',
    },
  },
  'baby-pink': {
    label: 'Baby Pink',
    palette: {
      50: '#fff5fc',
      100: '#ffeaf7',
      200: '#ffd5ee',
      300: '#ffbadf',
      400: '#f592c6',
      500: '#e06baa',
      600: '#c44d8a',
    },
    tokens: {
      base: '#FFFCFF',
      surface: '#FFF2FB',
      glass: 'rgba(255, 246, 253, 0.76)',
      textPrimary: '#3B2430',
      textSecondary: '#9A6E82',
      navActive: '#C95F8B',
      navInactive: '#D3B1C1',
      bgMain: 'linear-gradient(168deg, #FFF4FC 0%, #FFE8F7 32%, #FFD8F0 62%, #FFCAE8 100%)',
      bgOverlay: 'linear-gradient(168deg, rgba(255, 244, 252, 0.5) 0%, rgba(255, 216, 240, 0.25) 100%)',
      progressGradient: 'linear-gradient(90deg, #e06baa, #f592c6, #c44d8a)',
      vignette: 'radial-gradient(ellipse 120% 80% at 50% -10%, rgba(255,158,196,0.18) 0%, transparent 60%), radial-gradient(ellipse 80% 50% at 30% 50%, rgba(255,120,174,0.08) 0%, transparent 50%), radial-gradient(ellipse 100% 60% at 50% 110%, rgba(255,196,219,0.11) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 70% 30%, rgba(240,87,148,0.07) 0%, transparent 50%)',
      navGlassBg: 'linear-gradient(135deg, rgba(245,146,198,0.17) 0%, rgba(255,255,255,0.96) 52%, rgba(224,107,170,0.12) 100%)',
      navGlassBorder: 'rgba(255,230,245,0.92)',
      navGlassShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(255,224,243,0.6), 0 8px 32px rgba(224,107,170,0.22), 0 2px 8px rgba(196,77,138,0.1)',
      navGlassHighlight: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.82) 30%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.82) 70%, transparent 100%)',
      navIconActive: 'rgba(119, 60, 87, 0.95)',
      navIconInactive: 'rgba(145, 106, 126, 0.5)',
      navLabel: 'rgba(119, 60, 87, 0.9)',
      navPillBg: 'rgba(255,120,174,0.08)',
      navPillBorder: 'rgba(255,120,174,0.14)',
      navPillShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 8px rgba(255,120,174,0.16)',
      navCenterBgActive: 'linear-gradient(135deg, #e06baa 0%, #c44d8a 100%)',
      navCenterBgInactive: 'linear-gradient(135deg, rgba(224,107,170,0.86) 0%, rgba(196,77,138,0.86) 100%)',
      navCenterShadowActive: '0 4px 20px rgba(245,146,198,0.35), 0 2px 8px rgba(196,77,138,0.22), inset 0 1px 0 rgba(255,255,255,0.28)',
      navCenterShadowInactive: '0 4px 16px rgba(245,146,198,0.22), inset 0 1px 0 rgba(255,255,255,0.2)',
      orb1: 'radial-gradient(circle, rgba(255,158,196,0.22) 0%, rgba(255,120,174,0.07) 50%, transparent 70%)',
      orb2: 'radial-gradient(circle, rgba(255,196,219,0.18) 0%, rgba(240,87,148,0.06) 50%, transparent 70%)',
      orb3: 'radial-gradient(circle, rgba(255,220,233,0.17) 0%, rgba(255,120,174,0.05) 50%, transparent 70%)',
      starLinkRgb: '255,158,196',
      starCoreRgb: '255,120,174',
      partnerA: '255,120,174',
      partnerB: '255,196,219',
      particle1: '255,120,174',
      particle2: '255,158,196',
      particle3: '255,196,219',
      particle4: '255,220,233',
      particle5: '255,238,246',
      heartA: '255,196,219',
      heartB: '255,120,174',
      resonanceA: '255,120,174',
      resonanceB: '255,196,219',
      live3DBokeh: '#ff9ec4,#ff78ae,#f05794,#f9a8d4,#fbcfe8',
      live3DSparkle: '#ff9ec4,#ff78ae,#fbcfe8,#ffffff',
      floatingRim: '#ffdce9',
      floatingAccent: '#ff9ec4',
      floatingDust: '#ead7df',
      floatingLightA: '#ffe9f2',
      floatingLightB: '#ffffff',
      shadowXs: '0 4px 12px rgba(255, 120, 174, 0.06)',
      shadowSm: '0 8px 24px rgba(255, 120, 174, 0.10), 0 2px 8px rgba(240, 87, 148, 0.06)',
      shadowMd: '0 16px 40px rgba(255, 120, 174, 0.14), 0 4px 12px rgba(240, 87, 148, 0.08)',
      shadowLg: '0 32px 64px rgba(255, 120, 174, 0.18), 0 8px 24px rgba(240, 87, 148, 0.10)',
      shadowFloat: '0 40px 80px rgba(255, 120, 174, 0.24), 0 12px 36px rgba(240, 87, 148, 0.12), 0 4px 12px rgba(255, 158, 196, 0.10)',
    },
  },
  'warm-beige': {
    label: 'Warm Beige',
    palette: {
      50: '#fdfaf5',
      100: '#f9f0e2',
      200: '#f1dfcc',
      300: '#e4c8a4',
      400: '#cfa87e',
      500: '#b08356',
      600: '#8f6238',
    },
    tokens: {
      base: '#FEFCF8',
      surface: '#FAF3E8',
      glass: 'rgba(255, 249, 240, 0.75)',
      textPrimary: '#3D2A1F',
      textSecondary: '#8E6E5A',
      navActive: '#A56E4F',
      navInactive: '#C7AB98',
      bgMain: 'linear-gradient(168deg, #FEF8EE 0%, #F8EDD8 28%, #F2E0C4 58%, #ECCFAE 100%)',
      bgOverlay: 'linear-gradient(168deg, rgba(255, 249, 238, 0.5) 0%, rgba(242, 224, 195, 0.25) 100%)',
      progressGradient: 'linear-gradient(90deg, #b08356, #cfa87e, #8f6238)',
      vignette: 'radial-gradient(ellipse 120% 80% at 50% -10%, rgba(221,179,139,0.18) 0%, transparent 60%), radial-gradient(ellipse 80% 50% at 30% 50%, rgba(201,150,111,0.09) 0%, transparent 50%), radial-gradient(ellipse 100% 60% at 50% 110%, rgba(244,227,207,0.11) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 70% 30%, rgba(171,119,86,0.08) 0%, transparent 50%)',
      navGlassBg: 'linear-gradient(135deg, rgba(221,179,139,0.17) 0%, rgba(255,255,255,0.96) 52%, rgba(201,150,111,0.12) 100%)',
      navGlassBorder: 'rgba(246,230,211,0.92)',
      navGlassShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(245,227,208,0.6), 0 8px 32px rgba(201,150,111,0.2), 0 2px 8px rgba(171,119,86,0.1)',
      navGlassHighlight: 'linear-gradient(90deg, transparent 0%, rgba(255,252,247,0.85) 30%, rgba(255,255,255,1) 50%, rgba(255,252,247,0.85) 70%, transparent 100%)',
      navIconActive: 'rgba(108, 73, 52, 0.95)',
      navIconInactive: 'rgba(144, 111, 91, 0.55)',
      navLabel: 'rgba(108, 73, 52, 0.92)',
      navPillBg: 'rgba(201,150,111,0.09)',
      navPillBorder: 'rgba(201,150,111,0.15)',
      navPillShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 8px rgba(201,150,111,0.16)',
      navCenterBgActive: 'linear-gradient(135deg, #c9966f 0%, #ab7756 100%)',
      navCenterBgInactive: 'linear-gradient(135deg, rgba(201,150,111,0.86) 0%, rgba(171,119,86,0.86) 100%)',
      navCenterShadowActive: '0 4px 20px rgba(221,179,139,0.32), 0 2px 8px rgba(171,119,86,0.2), inset 0 1px 0 rgba(255,255,255,0.28)',
      navCenterShadowInactive: '0 4px 16px rgba(221,179,139,0.2), inset 0 1px 0 rgba(255,255,255,0.2)',
      orb1: 'radial-gradient(circle, rgba(221,179,139,0.22) 0%, rgba(201,150,111,0.08) 50%, transparent 70%)',
      orb2: 'radial-gradient(circle, rgba(238,207,176,0.16) 0%, rgba(171,119,86,0.06) 50%, transparent 70%)',
      orb3: 'radial-gradient(circle, rgba(244,227,207,0.16) 0%, rgba(201,150,111,0.05) 50%, transparent 70%)',
      starLinkRgb: '221,179,139',
      starCoreRgb: '201,150,111',
      partnerA: '201,150,111',
      partnerB: '221,179,139',
      particle1: '201,150,111',
      particle2: '221,179,139',
      particle3: '238,207,176',
      particle4: '244,227,207',
      particle5: '250,242,232',
      heartA: '238,207,176',
      heartB: '201,150,111',
      resonanceA: '201,150,111',
      resonanceB: '221,179,139',
      live3DBokeh: '#ddb38b,#c9966f,#ab7756,#eecfb0,#f4e3cf',
      live3DSparkle: '#ddb38b,#c9966f,#f4e3cf,#ffffff',
      floatingRim: '#f4e3cf',
      floatingAccent: '#ddb38b',
      floatingDust: '#decfbe',
      floatingLightA: '#f9ecdd',
      floatingLightB: '#fffdf9',
      shadowXs: '0 4px 12px rgba(201, 150, 111, 0.06)',
      shadowSm: '0 8px 24px rgba(201, 150, 111, 0.10), 0 2px 8px rgba(171, 119, 86, 0.06)',
      shadowMd: '0 16px 40px rgba(201, 150, 111, 0.14), 0 4px 12px rgba(171, 119, 86, 0.08)',
      shadowLg: '0 32px 64px rgba(201, 150, 111, 0.18), 0 8px 24px rgba(171, 119, 86, 0.10)',
      shadowFloat: '0 40px 80px rgba(201, 150, 111, 0.24), 0 12px 36px rgba(171, 119, 86, 0.12), 0 4px 12px rgba(221, 179, 139, 0.10)',
    },
  },
  teal: {
    label: 'Teal Lagoon',
    palette: {
      50: '#edfffe',
      100: '#cffaf5',
      200: '#97f0e6',
      300: '#57ddd0',
      400: '#26c4b5',
      500: '#0fa89a',
      600: '#097870',
    },
    tokens: {
      base: '#F5FEFC',
      surface: '#E8F9F5',
      glass: 'rgba(232, 252, 248, 0.74)',
      textPrimary: '#123733',
      textSecondary: '#4D7E78',
      navActive: '#1B7A72',
      navInactive: '#8CB9B3',
      bgMain: 'linear-gradient(168deg, #E2FBF7 0%, #CAF5EE 30%, #B2ECE4 60%, #9CE3DA 100%)',
      bgOverlay: 'linear-gradient(168deg, rgba(226, 251, 247, 0.5) 0%, rgba(178, 236, 228, 0.25) 100%)',
      progressGradient: 'linear-gradient(90deg, #0fa89a, #26c4b5, #097870)',
      vignette: 'radial-gradient(ellipse 120% 80% at 50% -10%, rgba(45,212,191,0.19) 0%, transparent 60%), radial-gradient(ellipse 80% 50% at 30% 50%, rgba(20,184,166,0.09) 0%, transparent 50%), radial-gradient(ellipse 100% 60% at 50% 110%, rgba(153,246,228,0.10) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 70% 30%, rgba(15,118,110,0.08) 0%, transparent 50%)',
      navGlassBg: 'linear-gradient(135deg, rgba(45,212,191,0.15) 0%, rgba(255,255,255,0.95) 50%, rgba(20,184,166,0.12) 100%)',
      navGlassBorder: 'rgba(219,250,244,0.92)',
      navGlassShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(220,246,240,0.55), 0 8px 32px rgba(20,184,166,0.2), 0 2px 8px rgba(15,118,110,0.1)',
      navGlassHighlight: 'linear-gradient(90deg, transparent 0%, rgba(238,255,251,0.9) 30%, rgba(255,255,255,1) 50%, rgba(238,255,251,0.9) 70%, transparent 100%)',
      navIconActive: 'rgba(19, 96, 88, 0.95)',
      navIconInactive: 'rgba(72, 134, 125, 0.55)',
      navLabel: 'rgba(19, 96, 88, 0.9)',
      navPillBg: 'rgba(20,184,166,0.09)',
      navPillBorder: 'rgba(20,184,166,0.15)',
      navPillShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 8px rgba(20,184,166,0.17)',
      navCenterBgActive: 'linear-gradient(135deg, #0fa89a 0%, #097870 100%)',
      navCenterBgInactive: 'linear-gradient(135deg, rgba(15,168,154,0.86) 0%, rgba(9,120,112,0.86) 100%)',
      navCenterShadowActive: '0 4px 20px rgba(38,196,181,0.36), 0 2px 8px rgba(9,120,112,0.24), inset 0 1px 0 rgba(255,255,255,0.28)',
      navCenterShadowInactive: '0 4px 16px rgba(38,196,181,0.22), inset 0 1px 0 rgba(255,255,255,0.2)',
      orb1: 'radial-gradient(circle, rgba(45,212,191,0.22) 0%, rgba(20,184,166,0.08) 50%, transparent 70%)',
      orb2: 'radial-gradient(circle, rgba(94,234,212,0.18) 0%, rgba(15,118,110,0.06) 50%, transparent 70%)',
      orb3: 'radial-gradient(circle, rgba(153,246,228,0.16) 0%, rgba(20,184,166,0.05) 50%, transparent 70%)',
      starLinkRgb: '94,234,212',
      starCoreRgb: '45,212,191',
      partnerA: '20,184,166',
      partnerB: '94,234,212',
      particle1: '20,184,166',
      particle2: '45,212,191',
      particle3: '94,234,212',
      particle4: '153,246,228',
      particle5: '204,251,241',
      heartA: '153,246,228',
      heartB: '20,184,166',
      resonanceA: '20,184,166',
      resonanceB: '94,234,212',
      live3DBokeh: '#2dd4bf,#14b8a6,#0f766e,#5eead4,#99f6e4',
      live3DSparkle: '#5eead4,#2dd4bf,#99f6e4,#ffffff',
      floatingRim: '#99f6e4',
      floatingAccent: '#2dd4bf',
      floatingDust: '#c4e7e1',
      floatingLightA: '#d6faf3',
      floatingLightB: '#ffffff',
      shadowXs: '0 4px 12px rgba(20, 184, 166, 0.06)',
      shadowSm: '0 8px 24px rgba(20, 184, 166, 0.10), 0 2px 8px rgba(15, 118, 110, 0.06)',
      shadowMd: '0 16px 40px rgba(20, 184, 166, 0.14), 0 4px 12px rgba(15, 118, 110, 0.08)',
      shadowLg: '0 32px 64px rgba(20, 184, 166, 0.18), 0 8px 24px rgba(15, 118, 110, 0.10)',
      shadowFloat: '0 40px 80px rgba(20, 184, 166, 0.24), 0 12px 36px rgba(15, 118, 110, 0.12), 0 4px 12px rgba(45, 212, 191, 0.10)',
    },
  },
  ocean: {
    label: 'Ocean Blue',
    palette: {
      50: '#eef4ff',
      100: '#d8e9ff',
      200: '#b4d3ff',
      300: '#84b4ff',
      400: '#558ef5',
      500: '#3068e0',
      600: '#1e4dbe',
    },
    tokens: {
      base: '#F5F9FF',
      surface: '#EEF4FF',
      glass: 'rgba(238, 246, 255, 0.74)',
      textPrimary: '#132033',
      textSecondary: '#5D7698',
      navActive: '#2B5C9A',
      navInactive: '#92A8C3',
      bgMain: 'linear-gradient(168deg, #E8F2FF 0%, #D4E7FF 30%, #BEDAFF 60%, #A8CCFF 100%)',
      bgOverlay: 'linear-gradient(168deg, rgba(232, 242, 255, 0.5) 0%, rgba(190, 218, 255, 0.25) 100%)',
      progressGradient: 'linear-gradient(90deg, #3068e0, #558ef5, #1e4dbe)',
      vignette: 'radial-gradient(ellipse 120% 80% at 50% -10%, rgba(132,180,255,0.20) 0%, transparent 60%), radial-gradient(ellipse 80% 50% at 30% 50%, rgba(85,142,245,0.10) 0%, transparent 50%), radial-gradient(ellipse 100% 60% at 50% 110%, rgba(180,211,255,0.13) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 70% 30%, rgba(48,104,224,0.08) 0%, transparent 50%)',
      navGlassBg: 'linear-gradient(135deg, rgba(85,142,245,0.14) 0%, rgba(255,255,255,0.95) 50%, rgba(48,104,224,0.11) 100%)',
      navGlassBorder: 'rgba(212,231,255,0.95)',
      navGlassShadow: 'inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -1px 0 rgba(208,228,255,0.55), 0 8px 32px rgba(48,104,224,0.18), 0 2px 8px rgba(30,77,190,0.1)',
      navGlassHighlight: 'linear-gradient(90deg, transparent 0%, rgba(232,241,255,0.9) 30%, rgba(255,255,255,1) 50%, rgba(232,241,255,0.9) 70%, transparent 100%)',
      navIconActive: 'rgba(18, 52, 110, 0.95)',
      navIconInactive: 'rgba(70, 110, 158, 0.5)',
      navLabel: 'rgba(18, 52, 110, 0.9)',
      navPillBg: 'rgba(48,104,224,0.08)',
      navPillBorder: 'rgba(85,142,245,0.16)',
      navPillShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 8px rgba(48,104,224,0.18)',
      navCenterBgActive: 'linear-gradient(135deg, #3068e0 0%, #1e4dbe 100%)',
      navCenterBgInactive: 'linear-gradient(135deg, rgba(48,104,224,0.86) 0%, rgba(30,77,190,0.86) 100%)',
      navCenterShadowActive: '0 4px 20px rgba(85,142,245,0.38), 0 2px 8px rgba(30,77,190,0.26), inset 0 1px 0 rgba(255,255,255,0.3)',
      navCenterShadowInactive: '0 4px 16px rgba(85,142,245,0.22), inset 0 1px 0 rgba(255,255,255,0.2)',
      orb1: 'radial-gradient(circle, rgba(85,142,245,0.22) 0%, rgba(48,104,224,0.08) 50%, transparent 70%)',
      orb2: 'radial-gradient(circle, rgba(132,180,255,0.18) 0%, rgba(30,77,190,0.06) 50%, transparent 70%)',
      orb3: 'radial-gradient(circle, rgba(180,211,255,0.18) 0%, rgba(48,104,224,0.05) 50%, transparent 70%)',
      starLinkRgb: '132,180,255',
      starCoreRgb: '85,142,245',
      partnerA: '48,104,224',
      partnerB: '85,142,245',
      particle1: '85,142,245',
      particle2: '132,180,255',
      particle3: '180,211,255',
      particle4: '48,104,224',
      particle5: '216,233,255',
      heartA: '180,211,255',
      heartB: '85,142,245',
      resonanceA: '48,104,224',
      resonanceB: '132,180,255',
      live3DBokeh: '#558ef5,#3068e0,#1e4dbe,#84b4ff,#2252b8',
      live3DSparkle: '#84b4ff,#558ef5,#b4d3ff,#ffffff',
      floatingRim: '#b4d3ff',
      floatingAccent: '#558ef5',
      floatingDust: '#c8dcff',
      floatingLightA: '#d8eaff',
      floatingLightB: '#ffffff',
      shadowXs: '0 4px 12px rgba(48, 104, 224, 0.06)',
      shadowSm: '0 8px 24px rgba(48, 104, 224, 0.10), 0 2px 8px rgba(30, 77, 190, 0.06)',
      shadowMd: '0 16px 40px rgba(48, 104, 224, 0.14), 0 4px 12px rgba(30, 77, 190, 0.08)',
      shadowLg: '0 32px 64px rgba(48, 104, 224, 0.18), 0 8px 24px rgba(30, 77, 190, 0.10)',
      shadowFloat: '0 40px 80px rgba(48, 104, 224, 0.24), 0 12px 36px rgba(30, 77, 190, 0.12), 0 4px 12px rgba(85, 142, 245, 0.10)',
    },
  },
  rosewood: {
    label: 'Rosewood',
    palette: {
      50: '#fef0f4',
      100: '#fddde6',
      200: '#fbbeca',
      300: '#f68ea8',
      400: '#ee5c80',
      500: '#c42e54',
      600: '#9c1238',
    },
    tokens: {
      base: '#FEFBFC',
      surface: '#FDEAEF',
      glass: 'rgba(253, 237, 243, 0.74)',
      textPrimary: '#3D0F1E',
      textSecondary: '#8B4458',
      navActive: '#A52E4E',
      navInactive: '#C4A0AC',
      bgMain: 'linear-gradient(168deg, #FEE8EF 0%, #F8D4E0 30%, #F0BECE 60%, #E8AABB 100%)',
      bgOverlay: 'linear-gradient(168deg, rgba(254, 232, 239, 0.5) 0%, rgba(240, 190, 206, 0.25) 100%)',
      progressGradient: 'linear-gradient(90deg, #c42e54, #ee5c80, #9c1238)',
      vignette: 'radial-gradient(ellipse 120% 80% at 50% -10%, rgba(240,94,132,0.18) 0%, transparent 60%), radial-gradient(ellipse 80% 50% at 30% 50%, rgba(199,52,89,0.09) 0%, transparent 50%), radial-gradient(ellipse 100% 60% at 50% 110%, rgba(247,143,171,0.11) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 70% 30%, rgba(159,18,57,0.08) 0%, transparent 50%)',
      navGlassBg: 'linear-gradient(135deg, rgba(240,94,132,0.16) 0%, rgba(255,255,255,0.95) 50%, rgba(199,52,89,0.12) 100%)',
      navGlassBorder: 'rgba(253,226,233,0.92)',
      navGlassShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(252,220,228,0.6), 0 8px 32px rgba(199,52,89,0.22), 0 2px 8px rgba(159,18,57,0.1)',
      navGlassHighlight: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.82) 30%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.82) 70%, transparent 100%)',
      navIconActive: 'rgba(100, 24, 46, 0.95)',
      navIconInactive: 'rgba(139, 68, 88, 0.5)',
      navLabel: 'rgba(100, 24, 46, 0.92)',
      navPillBg: 'rgba(199,52,89,0.08)',
      navPillBorder: 'rgba(199,52,89,0.15)',
      navPillShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 8px rgba(199,52,89,0.18)',
      navCenterBgActive: 'linear-gradient(135deg, #c73459 0%, #9f1239 100%)',
      navCenterBgInactive: 'linear-gradient(135deg, rgba(199,52,89,0.86) 0%, rgba(159,18,57,0.86) 100%)',
      navCenterShadowActive: '0 4px 20px rgba(247,143,171,0.35), 0 2px 8px rgba(199,52,89,0.24), inset 0 1px 0 rgba(255,255,255,0.28)',
      navCenterShadowInactive: '0 4px 16px rgba(247,143,171,0.22), inset 0 1px 0 rgba(255,255,255,0.2)',
      orb1: 'radial-gradient(circle, rgba(240,94,132,0.22) 0%, rgba(199,52,89,0.08) 50%, transparent 70%)',
      orb2: 'radial-gradient(circle, rgba(247,143,171,0.18) 0%, rgba(159,18,57,0.07) 50%, transparent 70%)',
      orb3: 'radial-gradient(circle, rgba(251,191,204,0.16) 0%, rgba(199,52,89,0.05) 50%, transparent 70%)',
      starLinkRgb: '247,143,171',
      starCoreRgb: '240,94,132',
      partnerA: '199,52,89',
      partnerB: '247,143,171',
      particle1: '240,94,132',
      particle2: '247,143,171',
      particle3: '251,191,204',
      particle4: '253,226,233',
      particle5: '254,241,244',
      heartA: '251,191,204',
      heartB: '240,94,132',
      resonanceA: '199,52,89',
      resonanceB: '247,143,171',
      live3DBokeh: '#f05e84,#c73459,#9f1239,#f78fab,#fbbfcc',
      live3DSparkle: '#f78fab,#f05e84,#fbbfcc,#ffffff',
      floatingRim: '#fbbfcc',
      floatingAccent: '#f05e84',
      floatingDust: '#e0c8cc',
      floatingLightA: '#fde8ec',
      floatingLightB: '#ffffff',
      shadowXs: '0 4px 12px rgba(199, 52, 89, 0.06)',
      shadowSm: '0 8px 24px rgba(199, 52, 89, 0.10), 0 2px 8px rgba(159, 18, 57, 0.06)',
      shadowMd: '0 16px 40px rgba(199, 52, 89, 0.14), 0 4px 12px rgba(159, 18, 57, 0.08)',
      shadowLg: '0 32px 64px rgba(199, 52, 89, 0.18), 0 8px 24px rgba(159, 18, 57, 0.10)',
      shadowFloat: '0 40px 80px rgba(199, 52, 89, 0.24), 0 12px 36px rgba(159, 18, 57, 0.12), 0 4px 12px rgba(240, 94, 132, 0.10)',
    },
  },
  sunset: {
    label: 'Sunset',
    palette: {
      50: '#fff8ed',
      100: '#feeeda',
      200: '#fbdab8',
      300: '#f5c088',
      400: '#ec9658',
      500: '#d86e2c',
      600: '#b55020',
    },
    tokens: {
      base: '#FFF8F2',
      surface: '#FEF2E4',
      glass: 'rgba(255, 248, 238, 0.72)',
      textPrimary: '#3A2316',
      textSecondary: '#8E6651',
      navActive: '#C55C2E',
      navInactive: '#C7A18D',
      bgMain: 'linear-gradient(168deg, #FFF4E8 0%, #FFE4C8 25%, #F8D2AE 52%, #F0C09C 78%, #E8AE94 100%)',
      bgOverlay: 'linear-gradient(168deg, rgba(255, 244, 232, 0.5) 0%, rgba(232, 174, 148, 0.25) 100%)',
      progressGradient: 'linear-gradient(90deg, #d86e2c, #ec9658, #b55020)',
      vignette: 'radial-gradient(ellipse 120% 80% at 50% -10%, rgba(236,150,88,0.20) 0%, transparent 60%), radial-gradient(ellipse 80% 50% at 30% 50%, rgba(216,110,44,0.10) 0%, transparent 50%), radial-gradient(ellipse 100% 60% at 50% 110%, rgba(245,192,136,0.13) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 70% 30%, rgba(181,80,32,0.09) 0%, transparent 50%)',
      navGlassBg: 'linear-gradient(135deg, rgba(236,150,88,0.17) 0%, rgba(255,255,255,0.96) 52%, rgba(216,110,44,0.12) 100%)',
      navGlassBorder: 'rgba(252,230,208,0.92)',
      navGlassShadow: 'inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -1px 0 rgba(252,222,190,0.55), 0 8px 32px rgba(216,110,44,0.20), 0 2px 8px rgba(181,80,32,0.10)',
      navGlassHighlight: 'linear-gradient(90deg, transparent 0%, rgba(255,244,232,0.9) 30%, rgba(255,255,255,1) 50%, rgba(255,244,232,0.9) 70%, transparent 100%)',
      navIconActive: 'rgba(124, 58, 22, 0.95)',
      navIconInactive: 'rgba(142, 90, 54, 0.55)',
      navLabel: 'rgba(124, 58, 22, 0.92)',
      navPillBg: 'rgba(216,110,44,0.09)',
      navPillBorder: 'rgba(236,150,88,0.18)',
      navPillShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 8px rgba(216,110,44,0.18)',
      navCenterBgActive: 'linear-gradient(135deg, #d86e2c 0%, #b55020 100%)',
      navCenterBgInactive: 'linear-gradient(135deg, rgba(216,110,44,0.86) 0%, rgba(181,80,32,0.86) 100%)',
      navCenterShadowActive: '0 4px 20px rgba(236,150,88,0.38), 0 2px 8px rgba(181,80,32,0.26), inset 0 1px 0 rgba(255,255,255,0.28)',
      navCenterShadowInactive: '0 4px 16px rgba(236,150,88,0.22), inset 0 1px 0 rgba(255,255,255,0.2)',
      orb1: 'radial-gradient(circle, rgba(236,150,88,0.22) 0%, rgba(216,110,44,0.09) 50%, transparent 70%)',
      orb2: 'radial-gradient(circle, rgba(245,192,136,0.18) 0%, rgba(181,80,32,0.07) 50%, transparent 70%)',
      orb3: 'radial-gradient(circle, rgba(251,218,174,0.18) 0%, rgba(216,110,44,0.06) 50%, transparent 70%)',
      starLinkRgb: '236,150,88',
      starCoreRgb: '245,192,136',
      partnerA: '216,110,44',
      partnerB: '240,174,120',
      particle1: '236,150,88',
      particle2: '216,110,44',
      particle3: '245,192,136',
      particle4: '251,218,174',
      particle5: '254,238,218',
      heartA: '245,192,136',
      heartB: '216,110,44',
      resonanceA: '216,110,44',
      resonanceB: '236,150,88',
      live3DBokeh: '#ec9658,#d86e2c,#b55020,#f5c088,#fbdab8',
      live3DSparkle: '#f5c088,#ec9658,#fbdab8,#ffffff',
      floatingRim: '#f5c088',
      floatingAccent: '#ec9658',
      floatingDust: '#e4d0be',
      floatingLightA: '#fde8d0',
      floatingLightB: '#fffaf4',
      shadowXs: '0 4px 12px rgba(216, 110, 44, 0.06)',
      shadowSm: '0 8px 24px rgba(216, 110, 44, 0.10), 0 2px 8px rgba(181, 80, 32, 0.06)',
      shadowMd: '0 16px 40px rgba(216, 110, 44, 0.14), 0 4px 12px rgba(181, 80, 32, 0.08)',
      shadowLg: '0 32px 64px rgba(216, 110, 44, 0.18), 0 8px 24px rgba(181, 80, 32, 0.10)',
      shadowFloat: '0 40px 80px rgba(216, 110, 44, 0.24), 0 12px 36px rgba(181, 80, 32, 0.12), 0 4px 12px rgba(236, 150, 88, 0.10)',
    },
  },
  lavender: {
    label: 'Lavender',
    palette: {
      50: '#faf4ff',
      100: '#f2e4ff',
      200: '#e4caff',
      300: '#d0a4ff',
      400: '#b87af8',
      500: '#9b4ef5',
      600: '#7a28d4',
    },
    tokens: {
      base: '#FAF6FF',
      surface: '#F4EBFF',
      glass: 'rgba(248, 242, 255, 0.74)',
      textPrimary: '#271E38',
      textSecondary: '#776591',
      navActive: '#7245B2',
      navInactive: '#B19ECB',
      bgMain: 'linear-gradient(168deg, #F6EEFF 0%, #ECDBFF 30%, #E0C6FF 60%, #D4AEFF 100%)',
      bgOverlay: 'linear-gradient(168deg, rgba(246, 238, 255, 0.5) 0%, rgba(224, 198, 255, 0.25) 100%)',
      progressGradient: 'linear-gradient(90deg, #9b4ef5, #b87af8, #7a28d4)',
      vignette: 'radial-gradient(ellipse 120% 80% at 50% -10%, rgba(216,180,254,0.18) 0%, transparent 60%), radial-gradient(ellipse 80% 50% at 30% 50%, rgba(192,132,252,0.09) 0%, transparent 50%), radial-gradient(ellipse 100% 60% at 50% 110%, rgba(168,85,247,0.10) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 70% 30%, rgba(139,92,246,0.08) 0%, transparent 50%)',
      navGlassBg: 'linear-gradient(135deg, rgba(216,180,254,0.16) 0%, rgba(255,255,255,0.95) 50%, rgba(168,85,247,0.12) 100%)',
      navGlassBorder: 'rgba(236,227,250,0.92)',
      navGlassShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(235,222,250,0.6), 0 8px 32px rgba(168,85,247,0.2), 0 2px 8px rgba(139,92,246,0.11)',
      navGlassHighlight: 'linear-gradient(90deg, transparent 0%, rgba(245,238,255,0.9) 30%, rgba(255,255,255,1) 50%, rgba(245,238,255,0.9) 70%, transparent 100%)',
      navIconActive: 'rgba(90, 56, 143, 0.95)',
      navIconInactive: 'rgba(123, 95, 165, 0.52)',
      navLabel: 'rgba(90, 56, 143, 0.92)',
      navPillBg: 'rgba(168,85,247,0.08)',
      navPillBorder: 'rgba(168,85,247,0.14)',
      navPillShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 8px rgba(168,85,247,0.18)',
      navCenterBgActive: 'linear-gradient(135deg, #9b4ef5 0%, #7a28d4 100%)',
      navCenterBgInactive: 'linear-gradient(135deg, rgba(155,78,245,0.86) 0%, rgba(122,40,212,0.86) 100%)',
      navCenterShadowActive: '0 4px 20px rgba(208,162,252,0.38), 0 2px 8px rgba(122,40,212,0.26), inset 0 1px 0 rgba(255,255,255,0.28)',
      navCenterShadowInactive: '0 4px 16px rgba(208,162,252,0.22), inset 0 1px 0 rgba(255,255,255,0.2)',
      orb1: 'radial-gradient(circle, rgba(216,180,254,0.20) 0%, rgba(168,85,247,0.08) 50%, transparent 70%)',
      orb2: 'radial-gradient(circle, rgba(192,132,252,0.16) 0%, rgba(139,92,246,0.07) 50%, transparent 70%)',
      orb3: 'radial-gradient(circle, rgba(233,213,255,0.17) 0%, rgba(168,85,247,0.05) 50%, transparent 70%)',
      starLinkRgb: '216,180,254',
      starCoreRgb: '192,132,252',
      partnerA: '168,85,247',
      partnerB: '236,72,153',
      particle1: '192,132,252',
      particle2: '168,85,247',
      particle3: '216,180,254',
      particle4: '236,72,153',
      particle5: '243,232,255',
      heartA: '233,213,255',
      heartB: '192,132,252',
      resonanceA: '168,85,247',
      resonanceB: '236,72,153',
      live3DBokeh: '#e879f9,#c084fc,#a855f7,#8b5cf6,#7e22ce',
      live3DSparkle: '#f0abfc,#c084fc,#a855f7,#ffffff',
      floatingRim: '#e9d5ff',
      floatingAccent: '#c084fc',
      floatingDust: '#d7c9e8',
      floatingLightA: '#efe0ff',
      floatingLightB: '#ffffff',
      shadowXs: '0 4px 12px rgba(168, 85, 247, 0.06)',
      shadowSm: '0 8px 24px rgba(168, 85, 247, 0.10), 0 2px 8px rgba(139, 92, 246, 0.06)',
      shadowMd: '0 16px 40px rgba(168, 85, 247, 0.14), 0 4px 12px rgba(236, 72, 153, 0.08)',
      shadowLg: '0 32px 64px rgba(168, 85, 247, 0.18), 0 8px 24px rgba(236, 72, 153, 0.10)',
      shadowFloat: '0 40px 80px rgba(168, 85, 247, 0.24), 0 12px 36px rgba(236, 72, 153, 0.12), 0 4px 12px rgba(192, 132, 252, 0.10)',
    },
  },
  'starry-night': {
    label: 'Starry Night',
    palette: {
      50: '#f0f0ff',
      100: '#dddeff',
      200: '#bebfff',
      300: '#9fa2ff',
      400: '#7b80f8',
      500: '#4840e8',
      600: '#3428a6',
    },
    tokens: {
      base: '#0B0D1E',
      surface: '#121425',
      glass: 'rgba(14, 16, 36, 0.65)',
      textPrimary: '#E8EAFF',
      textSecondary: '#9499C8',
      navActive: '#A5AEFF',
      navInactive: '#4A4E7A',
      bgMain: 'linear-gradient(168deg, #080A1E 0%, #0C1038 32%, #10166A 62%, #160C52 100%)',
      bgOverlay: 'linear-gradient(168deg, rgba(12, 16, 56, 0.5) 0%, rgba(22, 12, 82, 0.4) 100%)',
      progressGradient: 'linear-gradient(90deg, #4840e8, #7b80f8, #9fa2ff)',
      vignette: 'radial-gradient(ellipse 120% 80% at 50% -10%, rgba(129,140,248,0.28) 0%, transparent 60%), radial-gradient(ellipse 80% 50% at 30% 50%, rgba(79,70,229,0.14) 0%, transparent 50%), radial-gradient(ellipse 100% 60% at 50% 110%, rgba(192,132,252,0.14) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 70% 30%, rgba(55,48,163,0.12) 0%, transparent 50%)',
      navGlassBg: 'linear-gradient(135deg, rgba(30,28,80,0.72) 0%, rgba(20,18,60,0.88) 100%)',
      navGlassBorder: 'rgba(129,140,248,0.22)',
      navGlassShadow: 'inset 0 1px 0 rgba(165,174,255,0.12), inset 0 -1px 0 rgba(10,8,40,0.45), 0 8px 32px rgba(79,70,229,0.4), 0 2px 8px rgba(15,12,50,0.6)',
      navGlassHighlight: 'linear-gradient(90deg, transparent 0%, rgba(165,174,255,0.18) 30%, rgba(165,174,255,0.28) 50%, rgba(165,174,255,0.18) 70%, transparent 100%)',
      navIconActive: 'rgba(220, 222, 255, 0.95)',
      navIconInactive: 'rgba(129, 140, 248, 0.5)',
      navLabel: 'rgba(220, 222, 255, 0.9)',
      navPillBg: 'rgba(79,70,229,0.22)',
      navPillBorder: 'rgba(129,140,248,0.3)',
      navPillShadow: 'inset 0 1px 0 rgba(165,174,255,0.1), 0 2px 12px rgba(79,70,229,0.35)',
      navCenterBgActive: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
      navCenterBgInactive: 'linear-gradient(135deg, rgba(99,102,241,0.82) 0%, rgba(79,70,229,0.82) 100%)',
      navCenterShadowActive: '0 4px 20px rgba(129,140,248,0.5), 0 2px 8px rgba(79,70,229,0.35), inset 0 1px 0 rgba(255,255,255,0.18)',
      navCenterShadowInactive: '0 4px 16px rgba(129,140,248,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
      orb1: 'radial-gradient(circle, rgba(129,140,248,0.30) 0%, rgba(79,70,229,0.14) 50%, transparent 70%)',
      orb2: 'radial-gradient(circle, rgba(192,132,252,0.22) 0%, rgba(55,48,163,0.10) 50%, transparent 70%)',
      orb3: 'radial-gradient(circle, rgba(165,174,255,0.20) 0%, rgba(79,70,229,0.08) 50%, transparent 70%)',
      starLinkRgb: '165,174,255',
      starCoreRgb: '192,132,252',
      partnerA: '129,140,248',
      partnerB: '192,132,252',
      particle1: '129,140,248',
      particle2: '165,174,255',
      particle3: '192,132,252',
      particle4: '79,70,229',
      particle5: '224,226,255',
      heartA: '165,174,255',
      heartB: '129,140,248',
      resonanceA: '79,70,229',
      resonanceB: '192,132,252',
      live3DBokeh: '#818cf8,#6366f1,#4f46e5,#c084fc,#3730a3',
      live3DSparkle: '#a5aeff,#818cf8,#c084fc,#e0e2ff',
      floatingRim: '#c4c8ff',
      floatingAccent: '#818cf8',
      floatingDust: '#2a2850',
      floatingLightA: '#3b3a80',
      floatingLightB: '#c4c8ff',
      shadowXs: '0 4px 12px rgba(15, 12, 50, 0.5)',
      shadowSm: '0 8px 24px rgba(10, 8, 40, 0.55), 0 2px 8px rgba(79, 70, 229, 0.18)',
      shadowMd: '0 16px 40px rgba(8, 6, 32, 0.65), 0 4px 12px rgba(79, 70, 229, 0.22)',
      shadowLg: '0 32px 64px rgba(5, 4, 20, 0.75), 0 8px 24px rgba(129, 140, 248, 0.18)',
      shadowFloat: '0 40px 80px rgba(5, 4, 20, 0.82), 0 12px 36px rgba(79, 70, 229, 0.28), 0 4px 12px rgba(192, 132, 252, 0.20)',
    },
  }
};

let transitionTimer: number | null = null;
const THEME_TRANSITION_MS = 600;

export const ThemeService = {
  applyTheme: (themeId: string) => {
    const validId = (THEMES[themeId as ThemeId] ? themeId : 'rose') as ThemeId;
    const { palette, tokens } = THEMES[validId];
    const root = document.documentElement;

    root.setAttribute('data-theme', validId);
    root.classList.add('theme-transitioning');

    if (transitionTimer !== null) {
      window.clearTimeout(transitionTimer);
      transitionTimer = null;
    }

    root.style.setProperty('--color-tulika-50', palette[50]);
    root.style.setProperty('--color-tulika-100', palette[100]);
    root.style.setProperty('--color-tulika-200', palette[200]);
    root.style.setProperty('--color-tulika-300', palette[300]);
    root.style.setProperty('--color-tulika-400', palette[400]);
    root.style.setProperty('--color-tulika-500', palette[500]);
    root.style.setProperty('--color-tulika-600', palette[600]);

    root.style.setProperty('--color-base', tokens.base);
    root.style.setProperty('--color-surface', tokens.surface);
    root.style.setProperty('--color-glass', tokens.glass);
    root.style.setProperty('--color-text-primary', tokens.textPrimary);
    root.style.setProperty('--color-text-secondary', tokens.textSecondary);
    root.style.setProperty('--color-nav-active', tokens.navActive);
    root.style.setProperty('--color-nav-inactive', tokens.navInactive);

    root.style.setProperty('--theme-bg-main', tokens.bgMain);
    root.style.setProperty('--theme-bg-overlay', tokens.bgOverlay);
    root.style.setProperty('--theme-progress-gradient', tokens.progressGradient);
    root.style.setProperty('--theme-vignette', tokens.vignette);

    root.style.setProperty('--theme-nav-glass-bg', tokens.navGlassBg);
    root.style.setProperty('--theme-nav-glass-border', tokens.navGlassBorder);
    root.style.setProperty('--theme-nav-glass-shadow', tokens.navGlassShadow);
    root.style.setProperty('--theme-nav-glass-highlight', tokens.navGlassHighlight);
    root.style.setProperty('--theme-nav-icon-active', tokens.navIconActive);
    root.style.setProperty('--theme-nav-icon-inactive', tokens.navIconInactive);
    root.style.setProperty('--theme-nav-label', tokens.navLabel);
    root.style.setProperty('--theme-nav-pill-bg', tokens.navPillBg);
    root.style.setProperty('--theme-nav-pill-border', tokens.navPillBorder);
    root.style.setProperty('--theme-nav-pill-shadow', tokens.navPillShadow);
    root.style.setProperty('--theme-nav-center-bg-active', tokens.navCenterBgActive);
    root.style.setProperty('--theme-nav-center-bg-inactive', tokens.navCenterBgInactive);
    root.style.setProperty('--theme-nav-center-shadow-active', tokens.navCenterShadowActive);
    root.style.setProperty('--theme-nav-center-shadow-inactive', tokens.navCenterShadowInactive);

    root.style.setProperty('--theme-orb-1', tokens.orb1);
    root.style.setProperty('--theme-orb-2', tokens.orb2);
    root.style.setProperty('--theme-orb-3', tokens.orb3);

    root.style.setProperty('--theme-star-link-rgb', tokens.starLinkRgb);
    root.style.setProperty('--theme-star-core-rgb', tokens.starCoreRgb);
    root.style.setProperty('--theme-partner-a-rgb', tokens.partnerA);
    root.style.setProperty('--theme-partner-b-rgb', tokens.partnerB);

    root.style.setProperty('--theme-particle-1-rgb', tokens.particle1);
    root.style.setProperty('--theme-particle-2-rgb', tokens.particle2);
    root.style.setProperty('--theme-particle-3-rgb', tokens.particle3);
    root.style.setProperty('--theme-particle-4-rgb', tokens.particle4);
    root.style.setProperty('--theme-particle-5-rgb', tokens.particle5);

    root.style.setProperty('--theme-heart-a-rgb', tokens.heartA);
    root.style.setProperty('--theme-heart-b-rgb', tokens.heartB);
    root.style.setProperty('--theme-resonance-a-rgb', tokens.resonanceA);
    root.style.setProperty('--theme-resonance-b-rgb', tokens.resonanceB);

    root.style.setProperty('--theme-live-3d-bokeh', tokens.live3DBokeh);
    root.style.setProperty('--theme-live-3d-sparkle', tokens.live3DSparkle);

    root.style.setProperty('--theme-floating-rim', tokens.floatingRim);
    root.style.setProperty('--theme-floating-accent', tokens.floatingAccent);
    root.style.setProperty('--theme-floating-dust', tokens.floatingDust);
    root.style.setProperty('--theme-floating-light-a', tokens.floatingLightA);
    root.style.setProperty('--theme-floating-light-b', tokens.floatingLightB);

    root.style.setProperty('--shadow-xs', tokens.shadowXs);
    root.style.setProperty('--shadow-sm', tokens.shadowSm);
    root.style.setProperty('--shadow-md', tokens.shadowMd);
    root.style.setProperty('--shadow-lg', tokens.shadowLg);
    root.style.setProperty('--shadow-float', tokens.shadowFloat);

    document.body.style.background = tokens.bgMain;
    document.body.style.color = tokens.textPrimary;

    transitionTimer = window.setTimeout(() => {
      root.classList.remove('theme-transitioning');
      transitionTimer = null;
    }, THEME_TRANSITION_MS + 50);
  },
  cleanup: () => {
    if (transitionTimer !== null) {
      window.clearTimeout(transitionTimer);
      transitionTimer = null;
    }
    document.documentElement.classList.remove('theme-transitioning');
  }
};
