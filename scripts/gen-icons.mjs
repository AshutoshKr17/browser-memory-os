import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('src/assets', { recursive: true });

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#g)"/>
  <path fill="#ffffff" d="M64 26c-16 0-28 11-28 26 0 8 4 15 10 20v14a6 6 0 0 0 6 6h24a6 6 0 0 0 6-6V72c6-5 10-12 10-20 0-15-12-26-28-26z" opacity="0.95"/>
  <circle cx="52" cy="52" r="5" fill="#6366f1"/>
  <circle cx="76" cy="52" r="5" fill="#6366f1"/>
  <circle cx="64" cy="66" r="5" fill="#8b5cf6"/>
  <path d="M52 52 L64 66 L76 52" stroke="#6366f1" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

for (const size of [16, 48, 128]) {
  await sharp(Buffer.from(svg(size)))
    .resize(size, size)
    .png()
    .toFile(`src/assets/icon-${size}.png`);
  console.log(`wrote src/assets/icon-${size}.png`);
}
