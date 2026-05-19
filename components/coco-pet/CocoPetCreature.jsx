import React from 'react';

// Coco — refined pet with scalloped silhouette, attached horns, depth shading
export const PET_VARIANTS = {
  rose: {
    label: 'Coco',
    body: ['#fff5ec', '#fbe2d4', '#e8b9a8'],
    belly: ['#fff1f3', '#f7c9ce'],
    horn: ['#ffd6df', '#e98aa3', '#a83f5e'],
    cheek: '#ff9aa8',
    nose: '#a83f5e',
    stroke: '#caa193',
    line: '#7a2940',
    shade: 'rgba(168, 63, 94, 0.12)',
  },
  mint: {
    label: 'Pip',
    body: ['#f0fff4', '#cdebd6', '#9ec9b0'],
    belly: ['#f5fff8', '#c8eed5'],
    horn: ['#dcfce8', '#7dd3a8', '#2d7a52'],
    cheek: '#ffb3c0',
    nose: '#2d7a52',
    stroke: '#7da890',
    line: '#244d39',
    shade: 'rgba(36, 77, 57, 0.1)',
  },
  lavender: {
    label: 'Mochi',
    body: ['#faf5ff', '#e9d5ff', '#c4a3e0'],
    belly: ['#fdf4ff', '#f0d8f5'],
    horn: ['#e9d5ff', '#a78bda', '#5b3a87'],
    cheek: '#ffaad4',
    nose: '#7c4ca8',
    stroke: '#a989b8',
    line: '#3d2562',
    shade: 'rgba(91, 58, 135, 0.12)',
  },
  butter: {
    label: 'Sunny',
    body: ['#fffbeb', '#fde68a', '#d9b06a'],
    belly: ['#fffced', '#fbe7a8'],
    horn: ['#fef3c7', '#f6c344', '#8a5a18'],
    cheek: '#ff9a7a',
    nose: '#a8662b',
    stroke: '#b89868',
    line: '#5c3a14',
    shade: 'rgba(138, 90, 24, 0.12)',
  },
  sky: {
    label: 'Bluu',
    body: ['#f0f9ff', '#bae0fd', '#7eb6e0'],
    belly: ['#f5fbff', '#c5e3f7'],
    horn: ['#cfe9ff', '#5da3d9', '#1f4e7a'],
    cheek: '#ff9ec1',
    nose: '#2c5d8a',
    stroke: '#7ea5c2',
    line: '#1a3a5c',
    shade: 'rgba(31, 78, 122, 0.12)',
  },
};

// Scalloped silhouette path generators
function scallopedHead(cx, cy, rx, ry, scallops = 18) {
  // Returns a closed path with bumpy edge
  const pts = [];
  for (let i = 0; i <= scallops; i++) {
    const a = (i / scallops) * Math.PI * 2 - Math.PI / 2;
    const bump = (i % 2 === 0) ? 1 : 0.94;
    pts.push([cx + Math.cos(a) * rx * bump, cy + Math.sin(a) * ry * bump]);
  }
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i];
    const [px, py] = pts[i - 1];
    const mx = (x + px) / 2;
    const my = (y + py) / 2;
    d += ` Q ${px} ${py} ${mx} ${my}`;
  }
  d += ' Z';
  return d;
}

export function CocoPet({ pulse = 0, variant = 'rose', happy = true, eating = false, equipped = [] }) {
  const v = PET_VARIANTS[variant] || PET_VARIANTS.rose;
  const has = (id) => equipped.includes(id);
  const [blink, setBlink] = React.useState(false);
  const [wave, setWave] = React.useState(false);
  const [bounce, setBounce] = React.useState(false);
  const id = variant;

  React.useEffect(() => {
    let t1, t2, t3;
    const loopBlink = () => {
      setBlink(true);
      t1 = setTimeout(() => setBlink(false), 140);
      t2 = setTimeout(loopBlink, 2200 + Math.random() * 2800);
    };
    const loopWave = () => {
      setWave(true);
      t3 = setTimeout(() => setWave(false), 1600);
      setTimeout(loopWave, 5000 + Math.random() * 4000);
    };
    loopBlink();
    setTimeout(loopWave, 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  React.useEffect(() => {
    if (pulse > 0) {
      setBounce(true);
      const t = setTimeout(() => setBounce(false), 600);
      return () => clearTimeout(t);
    }
  }, [pulse]);

  const eyeY = blink ? 1.5 : 18;

  // Scalloped paths
  const headPath = scallopedHead(160, 178, 78, 70, 22);
  const bodyPath = "M 110 240 Q 90 244 86 270 Q 80 305 102 326 Q 130 344 160 344 Q 190 344 218 326 Q 240 305 234 270 Q 230 244 210 240 Q 195 246 175 248 Q 160 250 145 248 Q 125 246 110 240 Z";

  return (
    <div className={`coco-wrap ${bounce ? 'coco-bounce' : ''} ${eating ? 'coco-eating' : ''}`}>
      <div className="coco-shadow" />
      <div className="coco-float">
        <svg viewBox="0 0 320 380" width="100%" height="100%" style={{overflow: 'visible'}}>
          <defs>
            <radialGradient id={`bg-${id}`} cx="0.4" cy="0.3" r="0.95">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="35%" stopColor={v.body[0]} />
              <stop offset="70%" stopColor={v.body[1]} />
              <stop offset="100%" stopColor={v.body[2]} />
            </radialGradient>
            <radialGradient id={`belly-${id}`} cx="0.5" cy="0.35" r="0.75">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="70%" stopColor={v.belly[0]} />
              <stop offset="100%" stopColor={v.belly[1]} />
            </radialGradient>
            <linearGradient id={`horn-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={v.horn[0]} />
              <stop offset="60%" stopColor={v.horn[1]} />
              <stop offset="100%" stopColor={v.horn[2]} />
            </linearGradient>
            <radialGradient id={`cheek-${id}`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor={v.cheek} stopOpacity="0.9" />
              <stop offset="100%" stopColor={v.cheek} stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`eye-${id}`} cx="0.5" cy="0.5" r="0.55">
              <stop offset="0%" stopColor="#3b1422" />
              <stop offset="100%" stopColor="#1a0710" />
            </radialGradient>
            <radialGradient id={`face-shade-${id}`} cx="0.5" cy="0.5" r="0.55">
              <stop offset="0%" stopColor={v.shade} stopOpacity="0" />
              <stop offset="70%" stopColor={v.shade} stopOpacity="0" />
              <stop offset="100%" stopColor={v.shade} stopOpacity="1" />
            </radialGradient>
            {/* horn fluff base mask */}
            <clipPath id={`headclip-${id}`}>
              <path d={headPath} />
            </clipPath>
          </defs>

          {/* sparkles */}
          <g className="coco-sparkle">
            <circle cx="40" cy="80" r="2" fill="#fff" opacity="0.9" />
            <circle cx="285" cy="100" r="1.6" fill="#fff" opacity="0.8" />
            <circle cx="50" cy="300" r="1.4" fill="#fff" opacity="0.7" />
            <circle cx="270" cy="280" r="1.8" fill="#fff" opacity="0.8" />
          </g>

          {/* ===== Wings (behind everything) ===== */}
          {has('wings') && (
            <g className="acc-wings">
              <defs>
                <linearGradient id="wingGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#fdf4ff" />
                  <stop offset="60%" stopColor="#e9d5ff" />
                  <stop offset="100%" stopColor="#a78bda" />
                </linearGradient>
              </defs>
              {/* upper wing L */}
              <path d="M 110 240 Q 60 200 30 220 Q 20 250 50 270 Q 80 275 110 260 Z" fill="url(#wingGrad)" stroke="#7c4ca8" strokeWidth="1.2" opacity="0.95" />
              <path d="M 110 270 Q 70 280 50 305 Q 60 320 90 315 Q 110 305 115 290 Z" fill="url(#wingGrad)" stroke="#7c4ca8" strokeWidth="1.2" opacity="0.92" />
              {/* upper wing R */}
              <path d="M 210 240 Q 260 200 290 220 Q 300 250 270 270 Q 240 275 210 260 Z" fill="url(#wingGrad)" stroke="#7c4ca8" strokeWidth="1.2" opacity="0.95" />
              <path d="M 210 270 Q 250 280 270 305 Q 260 320 230 315 Q 210 305 205 290 Z" fill="url(#wingGrad)" stroke="#7c4ca8" strokeWidth="1.2" opacity="0.92" />
              {/* sparkle dots */}
              <circle cx="55" cy="240" r="2" fill="#fff" />
              <circle cx="265" cy="240" r="2" fill="#fff" />
              <circle cx="75" cy="295" r="1.5" fill="#fff" />
              <circle cx="245" cy="295" r="1.5" fill="#fff" />
            </g>
          )}

          {/* ===== Cape ===== */}
          {has('cape') && (
            <g className="acc-cape">
              <path d="M 100 230 Q 80 320 110 360 L 210 360 Q 240 320 220 230 Q 180 240 160 240 Q 140 240 100 230 Z" fill="#7a1d3a" stroke="#3a0c1c" strokeWidth="1.5" />
              <path d="M 110 250 L 210 250" stroke="#f6c344" strokeWidth="2" />
              <circle cx="120" cy="240" r="3" fill="#f6c344" />
              <circle cx="200" cy="240" r="3" fill="#f6c344" />
            </g>
          )}

          {/* feet */}
          <g className="coco-leg-l">
            <ellipse cx="132" cy="350" rx="26" ry="10" fill={v.body[2]} opacity="0.4" />
            <ellipse cx="132" cy="344" rx="24" ry="14" fill={`url(#bg-${id})`} stroke={v.stroke} strokeWidth="1.4" />
          </g>
          <g className="coco-leg-r">
            <ellipse cx="188" cy="350" rx="26" ry="10" fill={v.body[2]} opacity="0.4" />
            <ellipse cx="188" cy="344" rx="24" ry="14" fill={`url(#bg-${id})`} stroke={v.stroke} strokeWidth="1.4" />
          </g>

          {/* body — scalloped silhouette */}
          <g className="coco-body">
            <path d={bodyPath} fill={`url(#bg-${id})`} stroke={v.stroke} strokeWidth="1.5" strokeLinejoin="round" />
            {/* scalloped edge fluff — small subtle bumps along outline only */}
            <path d="M 86 268 Q 80 268 78 274 Q 80 280 86 278 M 234 268 Q 240 268 242 274 Q 240 280 234 278 M 100 320 Q 96 322 95 326 Q 100 328 102 324 M 220 320 Q 224 322 225 326 Q 220 328 218 324"
              stroke={v.stroke} strokeWidth="1" fill={v.body[0]} opacity="0.9" />
            {/* belly */}
            <ellipse cx="160" cy="298" rx="42" ry="40" fill={`url(#belly-${id})`} opacity="0.95" />
            {/* belly highlight */}
            <ellipse cx="148" cy="282" rx="14" ry="8" fill="#fff" opacity="0.4" />
          </g>

          {/* arms */}
          <g className={`coco-arm-l ${wave ? 'coco-wave' : ''}`} style={{transformOrigin: '108px 250px'}}>
            <path
              d="M 110 248 Q 90 256 80 282 Q 76 298 90 300 Q 104 298 108 284 Q 114 268 118 254 Z"
              fill={`url(#bg-${id})`} stroke={v.stroke} strokeWidth="1.4" strokeLinejoin="round"
            />
          </g>
          <g className="coco-arm-r" style={{transformOrigin: '212px 250px'}}>
            <path
              d="M 210 248 Q 230 256 240 282 Q 244 298 230 300 Q 216 298 212 284 Q 206 268 202 254 Z"
              fill={`url(#bg-${id})`} stroke={v.stroke} strokeWidth="1.4" strokeLinejoin="round"
            />
          </g>

          {/* ===== HEAD ===== */}
          <g className="coco-head">
            {/* horns — drawn FIRST so head fluff covers their base */}
            <g className="coco-horn">
              {/* outer horn L */}
              <path
                d="M 108 140
                   Q 96 110 88 78
                   Q 86 64 96 70
                   Q 106 80 116 110
                   Q 126 132 122 148
                   Q 116 152 108 140 Z"
                fill={`url(#horn-${id})`} stroke={v.line} strokeWidth="1.2" strokeLinejoin="round"
              />
              {/* outer horn R */}
              <path
                d="M 212 140
                   Q 224 110 232 78
                   Q 234 64 224 70
                   Q 214 80 204 110
                   Q 194 132 198 148
                   Q 204 152 212 140 Z"
                fill={`url(#horn-${id})`} stroke={v.line} strokeWidth="1.2" strokeLinejoin="round"
              />
              {/* inner small horn L */}
              <path d="M 142 122 Q 138 100 144 84 Q 152 100 152 124 Z" fill={`url(#horn-${id})`} stroke={v.line} strokeWidth="1" strokeLinejoin="round" />
              {/* inner small horn R */}
              <path d="M 178 122 Q 182 100 176 84 Q 168 100 168 124 Z" fill={`url(#horn-${id})`} stroke={v.line} strokeWidth="1" strokeLinejoin="round" />
              {/* horn highlights */}
              <path d="M 100 90 Q 102 100 108 108" stroke={v.horn[0]} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7" />
              <path d="M 220 90 Q 218 100 212 108" stroke={v.horn[0]} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7" />
            </g>

            {/* head — scalloped silhouette */}
            <path d={headPath} fill={`url(#bg-${id})`} stroke={v.stroke} strokeWidth="1.5" strokeLinejoin="round" />

            {/* face depth — soft inner shadow */}
            <ellipse cx="160" cy="180" rx="76" ry="68" fill={`url(#face-shade-${id})`} clipPath={`url(#headclip-${id})`} />

            {/* forehead highlight */}
            <ellipse cx="142" cy="146" rx="36" ry="18" fill="#fff" opacity="0.35" />

            {/* horn fluff covers — small tufts where horns meet head, intentional not pimples */}
            <path d="M 102 142 Q 96 138 96 132 Q 104 134 108 140 Z" fill={`url(#bg-${id})`} stroke={v.stroke} strokeWidth="1" strokeLinejoin="round" />
            <path d="M 218 142 Q 224 138 224 132 Q 216 134 212 140 Z" fill={`url(#bg-${id})`} stroke={v.stroke} strokeWidth="1" strokeLinejoin="round" />
            <path d="M 138 124 Q 134 118 142 112 Q 144 120 144 126 Z" fill={`url(#bg-${id})`} stroke={v.stroke} strokeWidth="1" strokeLinejoin="round" />
            <path d="M 182 124 Q 186 118 178 112 Q 176 120 176 126 Z" fill={`url(#bg-${id})`} stroke={v.stroke} strokeWidth="1" strokeLinejoin="round" />

            {/* tiny brows */}
            <path d="M 116 158 Q 128 153 140 159" stroke={v.line} strokeWidth="2.6" fill="none" strokeLinecap="round" />
            <path d="M 180 159 Q 192 153 204 158" stroke={v.line} strokeWidth="2.6" fill="none" strokeLinecap="round" />

            {/* HUGE chibi eyes */}
            <g>
              <ellipse cx="128" cy="186" rx="16" ry={eyeY} fill={`url(#eye-${id})`} />
              <ellipse cx="192" cy="186" rx="16" ry={eyeY} fill={`url(#eye-${id})`} />
              {!blink && (
                <>
                  <circle cx="133" cy="181" r="5.5" fill="#fff" />
                  <circle cx="197" cy="181" r="5.5" fill="#fff" />
                  <circle cx="123" cy="191" r="2.5" fill="#fff" opacity="0.7" />
                  <circle cx="187" cy="191" r="2.5" fill="#fff" opacity="0.7" />
                  <circle cx="130" cy="175" r="1.5" fill="#fff" opacity="0.9" />
                  <circle cx="194" cy="175" r="1.5" fill="#fff" opacity="0.9" />
                </>
              )}
            </g>

            {/* cheeks */}
            <ellipse cx="106" cy="208" rx="16" ry="9" fill={`url(#cheek-${id})`} />
            <ellipse cx="214" cy="208" rx="16" ry="9" fill={`url(#cheek-${id})`} />

            {/* nose */}
            <path d="M 154 205 Q 160 209 166 205 Q 162 213 160 213 Q 158 213 154 205 Z" fill={v.nose} />

            {/* mouth */}
            {happy && !eating && (
              <>
                <path d="M 148 217 Q 154 224 160 220 Q 166 224 172 217" stroke={v.line} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M 154 221 Q 160 226 166 221 Q 165 224 160 225 Q 155 224 154 221 Z" fill={v.cheek} opacity="0.6" />
              </>
            )}
            {eating && (
              <ellipse cx="160" cy="222" rx="9" ry="5.5" fill={v.line} className="coco-chew" />
            )}

            {/* ===== Glasses ===== */}
            {has('glasses') && (
              <g className="acc-glasses">
                {/* Heart-shaped frames */}
                <path d="M 128 178 C 122 172, 110 174, 108 184 C 108 192, 116 198, 128 200 C 140 198, 148 192, 148 184 C 146 174, 134 172, 128 178 Z" fill="none" stroke="#7a1d3a" strokeWidth="2.5" />
                <path d="M 192 178 C 186 172, 174 174, 172 184 C 172 192, 180 198, 192 200 C 204 198, 212 192, 212 184 C 210 174, 198 172, 192 178 Z" fill="none" stroke="#7a1d3a" strokeWidth="2.5" />
                {/* lens tint */}
                <path d="M 128 178 C 122 172, 110 174, 108 184 C 108 192, 116 198, 128 200 C 140 198, 148 192, 148 184 C 146 174, 134 172, 128 178 Z" fill="#ff9aa8" opacity="0.3" />
                <path d="M 192 178 C 186 172, 174 174, 172 184 C 172 192, 180 198, 192 200 C 204 198, 212 192, 212 184 C 210 174, 198 172, 192 178 Z" fill="#ff9aa8" opacity="0.3" />
                {/* bridge */}
                <path d="M 148 184 Q 160 180 172 184" stroke="#7a1d3a" strokeWidth="2.5" fill="none" />
                {/* shine */}
                <ellipse cx="118" cy="180" rx="5" ry="3" fill="#fff" opacity="0.7" />
                <ellipse cx="182" cy="180" rx="5" ry="3" fill="#fff" opacity="0.7" />
              </g>
            )}

            {/* ===== Sunglasses ===== */}
            {has('shades') && (
              <g className="acc-shades">
                <rect x="100" y="172" width="48" height="22" rx="11" fill="#1a0710" stroke="#3b1422" strokeWidth="1.5" />
                <rect x="172" y="172" width="48" height="22" rx="11" fill="#1a0710" stroke="#3b1422" strokeWidth="1.5" />
                <path d="M 148 180 L 172 180" stroke="#1a0710" strokeWidth="3" />
                <path d="M 108 175 L 116 178" stroke="#fff" strokeWidth="2" opacity="0.7" strokeLinecap="round" />
                <path d="M 180 175 L 188 178" stroke="#fff" strokeWidth="2" opacity="0.7" strokeLinecap="round" />
              </g>
            )}

            {/* ===== Bow Tie ===== */}
            {has('bowtie') && (
              <g className="acc-bowtie">
                <path d="M 140 232 L 130 220 L 130 244 Z" fill="#c83d5a" stroke="#7a1d3a" strokeWidth="1.2" />
                <path d="M 180 232 L 190 220 L 190 244 Z" fill="#c83d5a" stroke="#7a1d3a" strokeWidth="1.2" />
                <rect x="153" y="226" width="14" height="12" rx="3" fill="#a83f5e" stroke="#7a1d3a" strokeWidth="1.2" />
                <rect x="156" y="228" width="2" height="8" fill="#7a1d3a" opacity="0.5" />
                <rect x="162" y="228" width="2" height="8" fill="#7a1d3a" opacity="0.5" />
              </g>
            )}

            {/* ===== Scarf ===== */}
            {has('scarf') && (
              <g className="acc-scarf">
                <path d="M 100 232 Q 130 244 160 242 Q 190 244 220 232 L 222 256 Q 190 266 160 264 Q 130 266 98 256 Z"
                      fill="#c83d5a" stroke="#7a1d3a" strokeWidth="1.4" strokeLinejoin="round" />
                {/* knit stripes */}
                <path d="M 100 240 Q 160 250 220 240 M 100 250 Q 160 260 220 250" stroke="#a83f5e" strokeWidth="1.2" fill="none" opacity="0.5" />
                {/* tail */}
                <path d="M 188 252 Q 202 274 196 296 L 184 292 Q 180 270 184 254 Z" fill="#c83d5a" stroke="#7a1d3a" strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M 184 294 L 196 298" stroke="#fff" strokeWidth="1" opacity="0.6" />
                {/* fringe */}
                <path d="M 105 256 L 103 262 M 115 258 L 113 264 M 125 260 L 123 266 M 135 261 L 133 267 M 200 256 L 202 262 M 210 254 L 213 260" stroke="#fff" strokeWidth="1.2" opacity="0.6" />
              </g>
            )}

            {/* ===== Crown (crystal facets) ===== */}
            {has('crown') && (
              <g className="acc-crown">
                {/* base band */}
                <path d="M 124 92 L 196 92 L 198 102 L 122 102 Z" fill="#f6c344" stroke="#8a5a18" strokeWidth="1.5" strokeLinejoin="round" />
                {/* spikes with crystals */}
                <path d="M 130 92 L 138 64 L 146 92 Z" fill="#f6c344" stroke="#8a5a18" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M 152 92 L 160 56 L 168 92 Z" fill="#f6c344" stroke="#8a5a18" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M 174 92 L 182 64 L 190 92 Z" fill="#f6c344" stroke="#8a5a18" strokeWidth="1.5" strokeLinejoin="round" />
                {/* facet shading */}
                <path d="M 138 64 L 138 92 L 142 92 Z" fill="#8a5a18" opacity="0.2" />
                <path d="M 160 56 L 160 92 L 164 92 Z" fill="#8a5a18" opacity="0.2" />
                <path d="M 182 64 L 182 92 L 186 92 Z" fill="#8a5a18" opacity="0.2" />
                {/* gems */}
                <ellipse cx="138" cy="78" rx="3" ry="4" fill="#a83f5e" stroke="#5a1129" strokeWidth="0.8" />
                <ellipse cx="160" cy="72" rx="3.5" ry="5" fill="#5b3a87" stroke="#3d2562" strokeWidth="0.8" />
                <ellipse cx="182" cy="78" rx="3" ry="4" fill="#2d7a52" stroke="#244d39" strokeWidth="0.8" />
                {/* highlights */}
                <ellipse cx="137" cy="76" rx="1" ry="1.5" fill="#fff" opacity="0.8" />
                <ellipse cx="159" cy="69" rx="1" ry="1.5" fill="#fff" opacity="0.8" />
                <ellipse cx="181" cy="76" rx="1" ry="1.5" fill="#fff" opacity="0.8" />
              </g>
            )}

            {/* ===== Bloom Crown ===== */}
            {has('flower') && (
              <g className="acc-flower">
                {[
                  {cx: 110, cy: 116, c: '#ff9aa8'},
                  {cx: 132, cy: 100, c: '#ffd6df'},
                  {cx: 160, cy: 92, c: '#ff9aa8'},
                  {cx: 188, cy: 100, c: '#ffd6df'},
                  {cx: 210, cy: 116, c: '#ff9aa8'},
                ].map((f, fi) => (
                  <g key={fi}>
                    {[0, 72, 144, 216, 288].map((a, i) => (
                      <ellipse key={i} cx={f.cx + Math.cos(a*Math.PI/180)*7} cy={f.cy + Math.sin(a*Math.PI/180)*7} rx="5" ry="6.5" fill={f.c} stroke="#a83f5e" strokeWidth="0.8" transform={`rotate(${a} ${f.cx} ${f.cy})`} />
                    ))}
                    <circle cx={f.cx} cy={f.cy} r="3" fill="#f6c344" stroke="#8a5a18" strokeWidth="0.8" />
                  </g>
                ))}
                {/* leaves */}
                <ellipse cx="120" cy="118" rx="4" ry="2.5" fill="#7dd3a8" stroke="#2d7a52" strokeWidth="0.8" transform="rotate(-30 120 118)" />
                <ellipse cx="200" cy="118" rx="4" ry="2.5" fill="#7dd3a8" stroke="#2d7a52" strokeWidth="0.8" transform="rotate(30 200 118)" />
              </g>
            )}

            {/* ===== Bunny Ears ===== */}
            {has('bunny') && (
              <g className="acc-bunny">
                <path d="M 124 110 Q 116 70 122 50 Q 134 70 138 108 Z" fill={v.body[0]} stroke={v.line} strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M 196 110 Q 204 70 198 50 Q 186 70 182 108 Z" fill={v.body[0]} stroke={v.line} strokeWidth="1.4" strokeLinejoin="round" />
                {/* inner pink */}
                <path d="M 126 100 Q 122 78 126 64 Q 132 78 134 100 Z" fill="#ff9aa8" />
                <path d="M 194 100 Q 198 78 194 64 Q 188 78 186 100 Z" fill="#ff9aa8" />
              </g>
            )}

            {/* ===== Beanie ===== */}
            {has('beanie') && (
              <g className="acc-beanie">
                <path d="M 100 130 Q 100 88 160 86 Q 220 88 220 130 Q 220 140 215 142 L 105 142 Q 100 140 100 130 Z"
                      fill="#7a1d3a" stroke="#3a0c1c" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M 100 132 L 220 132 L 220 144 L 100 144 Z" fill="#a83f5e" stroke="#3a0c1c" strokeWidth="1.5" />
                {/* pompom */}
                <circle cx="160" cy="80" r="10" fill="#fff" stroke="#3a0c1c" strokeWidth="1.4" />
                <circle cx="156" cy="76" r="3" fill="#fff" stroke="#a83f5e" strokeWidth="0.8" opacity="0.8" />
              </g>
            )}

            {/* ===== Star Bow ===== */}
            {has('starbow') && (
              <g className="acc-starbow">
                {/* ribbon */}
                <path d="M 118 110 L 100 92 L 100 122 Z" fill="#c83d5a" stroke="#7a1d3a" strokeWidth="1.2" />
                <path d="M 138 110 L 156 92 L 156 122 Z" fill="#c83d5a" stroke="#7a1d3a" strokeWidth="1.2" />
                {/* knot */}
                <ellipse cx="128" cy="110" rx="6" ry="7" fill="#a83f5e" stroke="#7a1d3a" strokeWidth="1.2" />
                {/* star */}
                <path d="M 128 102 L 130 108 L 136 108 L 131 112 L 133 118 L 128 114 L 123 118 L 125 112 L 120 108 L 126 108 Z" fill="#f6c344" stroke="#8a5a18" strokeWidth="0.8" />
              </g>
            )}
          </g>

          {/* ===== Hand-held Lantern (in front of right arm) ===== */}
          {has('lantern') && (
            <g className="acc-lantern">
              <line x1="240" y1="280" x2="240" y2="252" stroke="#5c3a14" strokeWidth="1.5" />
              <path d="M 232 252 Q 240 248 248 252" stroke="#5c3a14" strokeWidth="1.5" fill="none" />
              <ellipse cx="240" cy="290" rx="14" ry="16" fill="#ffe9a8" stroke="#8a5a18" strokeWidth="1.5" />
              <rect x="232" y="278" width="16" height="2.5" fill="#8a5a18" />
              <rect x="232" y="298" width="16" height="2.5" fill="#8a5a18" />
              <ellipse cx="240" cy="290" rx="6" ry="8" fill="#fffced" opacity="0.95" />
              <circle cx="240" cy="290" r="2.5" fill="#fff" />
              {/* glow */}
              <circle cx="240" cy="290" r="22" fill="#ffe9a8" opacity="0.2" />
            </g>
          )}

          {/* ===== Sparkle Trail ===== */}
          {has('sparkle') && (
            <g className="acc-sparkletrail">
              {[
                {cx: 70, cy: 250, s: 4},
                {cx: 250, cy: 270, s: 5},
                {cx: 90, cy: 320, s: 3},
                {cx: 240, cy: 320, s: 3.5},
                {cx: 60, cy: 200, s: 3},
              ].map((s, i) => (
                <path key={i} d={`M ${s.cx} ${s.cy-s.s} L ${s.cx+s.s/3} ${s.cy-s.s/3} L ${s.cx+s.s} ${s.cy} L ${s.cx+s.s/3} ${s.cy+s.s/3} L ${s.cx} ${s.cy+s.s} L ${s.cx-s.s/3} ${s.cy+s.s/3} L ${s.cx-s.s} ${s.cy} L ${s.cx-s.s/3} ${s.cy-s.s/3} Z`} fill="#f6c344" opacity="0.85" />
              ))}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
