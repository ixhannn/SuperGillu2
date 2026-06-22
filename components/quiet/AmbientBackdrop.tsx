// Quiet Mode — Ambient Backdrop
// ─────────────────────────────────────────────────────────────────────────────
// The living atmosphere behind every memory. ONE soft drifting glow on
// near-black, contained by a vignette — the restrained, warm, premium language
// approved on the Aura screen. It looks intentional WITH a photo (cinematic
// blurred bleed) and, crucially, WITHOUT one (the glow + a faint constellation
// become the whole composition, so text-only and empty states never look
// broken).
//
// Both glow pools stay inside a SINGLE hue family (the second is just a deeper
// shade of the accent — never a foreign colour) so it can't read muddy. The
// drift animations translate only (never scale) so the heavy blur stays
// GPU-cached instead of re-rasterising every frame. Memoised so a parent
// re-render never restarts the drift.

import React from 'react';
import { ConstellationCanvas } from '../ConstellationCanvas';
import { RGB, rgbStr, baseGradient, mixRGB } from './ambient';

interface AmbientBackdropProps {
  accent: RGB;
  image: string | null;
  reduced: boolean;
  /** Hide the photo bleed during the intro so the glow reads as the hero. */
  photoActive: boolean;
}

const WHITE: RGB = { r: 255, g: 255, b: 255 };
const SHADE: RGB = { r: 12, g: 8, b: 16 };

const AmbientBackdropImpl: React.FC<AmbientBackdropProps> = ({ accent, image, reduced, photoActive }) => {
  const hasPhoto = !!image && photoActive;
  const accentLight = mixRGB(accent, WHITE, 0.32);
  const accentDeep = mixRGB(accent, SHADE, 0.55); // same hue, darker — for the 2nd pool
  // Calmer when there is no photo so the centre never blooms to white.
  const glowOpacity = hasPhoto ? 0.4 : 0.72;
  const starOpacity = hasPhoto ? 0.22 : 0.5;
  const colorTransition = 'background 1800ms ease';

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <style>{GLOW_KEYFRAMES}</style>

      {/* Deep base */}
      <div className="absolute inset-0" style={{ background: baseGradient(accent), transition: colorTransition }} />

      {/* Drifting glow pool — two layers, ONE hue family */}
      <div className="absolute inset-0" style={{ opacity: glowOpacity, transition: 'opacity 1600ms ease' }}>
        <div
          className="absolute rounded-full"
          style={{
            top: '14%', left: '50%', width: '82vmax', height: '82vmax',
            marginLeft: '-41vmax', marginTop: '-22vmax',
            background: `radial-gradient(circle, ${rgbStr(accentLight, 0.8)} 0%, ${rgbStr(accent, 0.42)} 40%, transparent 66%)`,
            mixBlendMode: 'screen', filter: 'blur(60px)', willChange: 'transform',
            transition: colorTransition,
            animation: reduced ? undefined : 'quietGlowA 28s ease-in-out infinite',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            top: '66%', left: '38%', width: '60vmax', height: '60vmax',
            marginLeft: '-30vmax', marginTop: '-30vmax',
            background: `radial-gradient(circle, ${rgbStr(accent, 0.5)} 0%, ${rgbStr(accentDeep, 0.36)} 44%, transparent 64%)`,
            mixBlendMode: 'screen', filter: 'blur(56px)', willChange: 'transform',
            transition: colorTransition,
            animation: reduced ? undefined : 'quietGlowB 35s ease-in-out infinite',
          }}
        />
      </div>

      {/* Cinematic blurred photo bleed (only when a photo exists). The inset
          overscan gives the translate-only drift room without re-rasterising. */}
      <div className="absolute inset-0 overflow-hidden" style={{ opacity: hasPhoto ? 0.82 : 0, transition: 'opacity 1600ms ease' }}>
        <div
          className="absolute inset-[-16%]"
          style={{
            backgroundImage: image ? `url(${image})` : 'none',
            backgroundSize: 'cover', backgroundPosition: 'center',
            filter: 'blur(34px) brightness(0.42) saturate(1.22)',
            transform: 'scale(1.12)', willChange: 'transform',
            animation: reduced ? undefined : 'quietBleed 34s ease-in-out infinite',
          }}
        />
      </div>

      {/* Faint constellation — strongest when there is no photo */}
      <div className="absolute inset-0" style={{ opacity: starOpacity, transition: 'opacity 1600ms ease' }}>
        <ConstellationCanvas />
      </div>

      {/* Vignette contains the glow as a pool; grain kills banding */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(118% 100% at 50% 50%, transparent 28%, rgba(4,3,7,0.52) 62%, #040308 92%)' }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(4,3,8,0.5) 0%, transparent 24%, transparent 66%, rgba(4,3,8,0.74) 100%)' }} />
      <div className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-[0.05]" style={{ backgroundImage: GRAIN_SVG, backgroundSize: '170px 170px' }} />
    </div>
  );
};

export const AmbientBackdrop = React.memo(AmbientBackdropImpl);

const GRAIN_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='170' height='170'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// Translate-only keyframes — the blurred layers never scale, so their costly
// blur raster stays cached on the GPU (avoids the documented full-screen-blur jank).
const GLOW_KEYFRAMES = `
@keyframes quietGlowA {
  0%   { transform: translate3d(-5%, 3%, 0); }
  50%  { transform: translate3d(6%, -5%, 0); }
  100% { transform: translate3d(-5%, 3%, 0); }
}
@keyframes quietGlowB {
  0%   { transform: translate3d(6%, -4%, 0); }
  50%  { transform: translate3d(-6%, 6%, 0); }
  100% { transform: translate3d(6%, -4%, 0); }
}
@keyframes quietBleed {
  0%   { transform: scale(1.12) translate3d(-1.4%, -1%, 0); }
  100% { transform: scale(1.12) translate3d(1.8%, 1.4%, 0); }
}
`;
