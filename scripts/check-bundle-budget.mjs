import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const assetsDir = new URL('../dist/assets/', import.meta.url);
const kib = 1024;

const budgets = {
  '.js': {
    raw: 760 * kib,
    gzip: 190 * kib,
  },
  '.css': {
    raw: 160 * kib,
    gzip: 32 * kib,
  },
};

const formatKib = (bytes) => `${(bytes / kib).toFixed(1)} KiB`;

if (!existsSync(assetsDir)) {
  console.error('Bundle budget check failed: dist/assets does not exist. Run vite build first.');
  process.exit(1);
}

const files = readdirSync(assetsDir).filter((file) => Object.keys(budgets).some((ext) => file.endsWith(ext)));

if (files.length === 0) {
  console.error('Bundle budget check failed: no JS or CSS assets found in dist/assets.');
  process.exit(1);
}

const failures = [];

for (const file of files) {
  const ext = file.endsWith('.css') ? '.css' : '.js';
  const budget = budgets[ext];
  const bytes = readFileSync(new URL(file, assetsDir));
  const gzipBytes = gzipSync(bytes, { level: 9 });

  if (bytes.length > budget.raw) {
    failures.push(`${file} raw ${formatKib(bytes.length)} exceeds ${formatKib(budget.raw)}`);
  }

  if (gzipBytes.length > budget.gzip) {
    failures.push(`${file} gzip ${formatKib(gzipBytes.length)} exceeds ${formatKib(budget.gzip)}`);
  }
}

if (failures.length > 0) {
  console.error(`Bundle budget check failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Bundle budget check passed for ${files.length} asset(s).`);
