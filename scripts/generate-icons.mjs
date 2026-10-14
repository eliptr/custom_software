import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#252923"/><g fill="none" stroke="#f7f6f0" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"><path d="M169 340V229c-29-3-48-21-48-48 0-30 25-54 55-54 8 0 16 2 23 5 10-29 29-45 57-45s47 16 57 45c7-3 15-5 23-5 30 0 55 24 55 54 0 27-19 45-48 48v111Z"/><path d="M169 309h174M216 238v31M256 238v31M296 238v31"/></g><path d="M180 385h152" stroke="#a8aca1" stroke-width="7" stroke-linecap="round"/></svg>`;
await mkdir('public/icons', { recursive: true });
for (const [size, name] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/icons/${name}`);
