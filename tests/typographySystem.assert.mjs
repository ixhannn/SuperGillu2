import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const indexHtmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
const indexCssSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const premiumFeaturesSource = readFileSync(new URL('../styles/premium-features.css', import.meta.url), 'utf8');
const cocoPetCssSource = readFileSync(new URL('../components/coco-pet/coco-pet.css', import.meta.url), 'utf8');
const cocoPetOverlaySource = readFileSync(new URL('../components/coco-pet/CocoPetOverlay.tsx', import.meta.url), 'utf8');
const mediaForgeSource = readFileSync(new URL('../components/MediaForge.tsx', import.meta.url), 'utf8');
const typographyUrl = new URL('../styles/typography.css', import.meta.url);
const tailwindSource = readFileSync(new URL('../tailwind.config.js', import.meta.url), 'utf8');

assert.ok(
  existsSync(typographyUrl),
  'Expected styles/typography.css to define the global Lior typography system',
);

const typographySource = readFileSync(typographyUrl, 'utf8');
const appTypographySource = [
  indexCssSource,
  premiumFeaturesSource,
  cocoPetCssSource,
  cocoPetOverlaySource,
  mediaForgeSource,
].join('\n');

assert.match(
  indexHtmlSource,
  /family=Afacad\+Flux:wght@400;500;600;700;800&family=Bricolage\+Grotesque:wght@500;600;700;800&display=swap/,
  'Expected index.html to load the consolidated Lior typography pairing',
);

assert.doesNotMatch(
  indexHtmlSource,
  /Lora|Nunito|Gloria\+Hallelujah|Plus\+Jakarta|Outfit|Inter/,
  'Expected old mixed font imports to be removed from index.html',
);

assert.match(
  indexCssSource,
  /^@tailwind base;/,
  'Expected index.css to start with Tailwind directives instead of a legacy font import',
);

assert.doesNotMatch(
  appTypographySource,
  /Baloo|Lora|Nunito|Gloria Hallelujah|Fraunces|Plus Jakarta|Outfit|Playfair|font-family:\s*'Inter'|font:\s*[^;]*'Inter'/,
  'Expected app CSS and inline typography to use the shared Lior font tokens only',
);

assert.match(
  indexSource,
  /import '\.\/styles\/typography\.css';/,
  'Expected the global typography system to load with the app styles',
);

assert.match(
  typographySource,
  /--font-ui:\s*"Afacad Flux"/,
  'Expected Afacad Flux to be the global UI/body font',
);

assert.match(
  typographySource,
  /--font-display:\s*"Bricolage Grotesque"/,
  'Expected Bricolage Grotesque to be the global display font',
);

assert.match(
  typographySource,
  /body[\s\S]*font-family:\s*var\(--font-ui\)[\s\S]*font-size:\s*var\(--type-body\)/,
  'Expected body typography to use the shared readable UI scale',
);

assert.match(
  typographySource,
  /\.font-serif[\s\S]*font-family:\s*var\(--font-display\)/,
  'Expected existing font-serif UI usage to map to the new display family',
);

assert.doesNotMatch(
  tailwindSource,
  /letterSpacing:\s*'-/,
  'Expected Tailwind typography tokens to avoid negative letter spacing',
);

assert.doesNotMatch(
  appTypographySource,
  /letter-spacing:\s*-/,
  'Expected app typography CSS to avoid negative letter spacing',
);

assert.ok(
  /fontFamily:[\s\S]*"Afacad Flux"/.test(tailwindSource)
    && /fontFamily:[\s\S]*"Bricolage Grotesque"/.test(tailwindSource),
  'Expected Tailwind font families to match the global typography pairing',
);
