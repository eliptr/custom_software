import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('public', { recursive: true });
await writeFile('public/sw.js', '// Service worker is configured in the application branch.\n');
