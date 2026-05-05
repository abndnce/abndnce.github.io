import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const woff = readFileSync(new URL('../gsans.woff2', import.meta.url));
const b64 = woff.toString('base64');
const dataUri = `data:font/woff2;base64,${b64}`;

let svg = readFileSync(new URL('../index.svg', import.meta.url), 'utf-8');
svg = svg.replace('GSANS_DATA_URI', dataUri);
mkdirSync(new URL('../dist', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/index.svg', import.meta.url), svg);
console.log('Built dist/index.svg');
