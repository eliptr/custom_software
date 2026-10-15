import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const hash = createHash('sha256');
async function fingerprint(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await fingerprint(filename);
    else if (filename !== path.join('public', 'sw.js')) { hash.update(filename.replaceAll('\\', '/')); hash.update(await readFile(filename)); }
  }
}
for (const directory of ['src', 'scripts', 'public']) await fingerprint(directory);
for (const filename of ['package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs']) hash.update(await readFile(filename));
const version = hash.digest('hex').slice(0, 20);
await mkdir('public', { recursive: true });
await writeFile('public/sw.js', (await readFile('scripts/service-worker.js', 'utf8')).replace('__VERSION__', version));
console.log(`Prepared offline shell ${version}`);
