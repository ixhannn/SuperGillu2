import { readdir } from 'node:fs/promises';

const testsDir = new URL('./', import.meta.url);
const files = (await readdir(testsDir))
  .filter((file) => file.endsWith('.assert.mjs'))
  .sort();

for (const file of files) {
  await import(new URL(file, testsDir));
}

console.log(`Ran ${files.length} assertion suites.`);
