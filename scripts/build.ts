import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const woff = readFileSync(new URL('../gsans.woff2', import.meta.url));
const b64 = woff.toString('base64');
const dataUri = `data:font/woff2;base64,${b64}`;

type StretchModel = {
  w25: number;
  w100: number;
  w151: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function solveStretch(targetRatio: number, model: StretchModel) {
  const belowSlope = (model.w100 - model.w25) / 75;
  const belowIntercept = model.w25 - belowSlope * 25;
  const aboveSlope = (model.w151 - model.w100) / 51;
  const aboveIntercept = model.w100 - aboveSlope * 100;

  const stretch =
    targetRatio <= model.w100
      ? (targetRatio - belowIntercept) / belowSlope
      : (targetRatio - aboveIntercept) / aboveSlope;

  return Math.round(clamp(stretch, 25, 151));
}

function ratioQuery(ratio: number) {
  return `${Math.round(ratio * 100)}/100`;
}

function buildHeroMedia() {
  // These are Firefox offsetWidth anchors at 100px font-size with
  // font-optical-sizing disabled and opsz pinned to 144 so the width model
  // scales linearly to the giant hero sizes.
  const zeroK: StretchModel = { w25: 0.41, w100: 1.12, w151: 2.07 };
  const discord: StretchModel = { w25: 1.16, w100: 3.06, w151: 5.97 };

  let css = '';
  let lastS2 = 25;
  let lastS5 = 25;

  for (let step = 101; step <= 260; step++) {
    const aspectRatio = step / 100;
    const s2Stretch = solveStretch(0.4 * aspectRatio, zeroK);
    const s5Stretch = solveStretch((0.98 / 0.9375) * aspectRatio, discord);

    if (s2Stretch === lastS2 && s5Stretch === lastS5) continue;

    css += `@media (min-aspect-ratio: ${ratioQuery(aspectRatio)}) {\n`;
    if (s2Stretch !== lastS2) {
      css += `  #s2 > h2 {\n    font-stretch: ${s2Stretch}%;\n  }\n`;
      lastS2 = s2Stretch;
    }
    if (s5Stretch !== lastS5) {
      css += `  #s5 > h2 {\n    font-stretch: ${s5Stretch}%;\n  }\n`;
      lastS5 = s5Stretch;
    }
    css += '}\n';
  }

  return css.trim();
}

function indentBlock(css: string, spaces: number) {
  const prefix = ' '.repeat(spaces);
  return css
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

let svg = readFileSync(new URL('../index.svg', import.meta.url), 'utf-8');
svg = svg.replace('GSANS_DATA_URI', dataUri);
svg = svg.replace('/* GENERATED_HERO_MEDIA */', indentBlock(buildHeroMedia(), 10));
mkdirSync(new URL('../dist', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/index.svg', import.meta.url), svg);
console.log('Built dist/index.svg');
