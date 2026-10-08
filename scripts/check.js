import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory() ? walk(path.join(dir, entry.name)) : path.join(dir, entry.name),
      ),
    )
  ).flat();
}
const files = (await Promise.all(['src', 'scripts', 'tests'].map(walk)))
  .flat()
  .filter((f) => f.endsWith('.js'));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(1);
  }
}
console.log(
  `JavaScript syntax checked: ${files.length} files. Frontend syntax is validated by the production build.`,
);
