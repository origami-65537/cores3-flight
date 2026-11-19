// Gzips the Vite build into firmware/data for `pio run -t uploadfs`.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = new URL('../dist/', import.meta.url).pathname;
const data = new URL('../../firmware/data/', import.meta.url).pathname;
rmSync(data, { recursive: true, force: true });
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
for (const file of walk(dist)) {
  const out = join(data, relative(dist, file)) + '.gz';
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, gzipSync(readFileSync(file), { level: 9 }));
}
console.log(`firmware/data ready (${walk(data).length} files)`);
