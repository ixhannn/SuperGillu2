import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const browserDirs = ['components', 'hooks', 'services', 'utils', 'views'];
const browserEntryFiles = ['App.tsx', 'index.tsx'];
const sourceFiles = [];

const collect = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      collect(path);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) sourceFiles.push(path);
  }
};

for (const dir of browserDirs) collect(join(root, dir));
for (const file of browserEntryFiles) sourceFiles.push(join(root, file));

for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  assert.doesNotMatch(
    source,
    /\brequire\s*\(/,
    `Browser module ${relative(root, file)} must not use CommonJS require(), which crashes Vite dev in the browser`,
  );
}
