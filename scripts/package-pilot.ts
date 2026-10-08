import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRelease, digest } from './release.ts';

const directory = resolve(process.argv[2] ?? 'dist/pilot');
await mkdir(directory, { recursive: true, mode: 0o700 });
const release = await buildRelease(fileURLToPath(new URL('../', import.meta.url)));
// Self-contained offline installer: no checkout, npm install, or third-party downloads.
const installer = `import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node 24 or newer is required.');
const release = ${JSON.stringify(release)};
const staging = await mkdtemp(join(tmpdir(), 'smart-codex-installer-'));
try {
  for (const [path, content] of Object.entries(release.files)) {
    await mkdir(dirname(join(staging, path)), { recursive: true, mode: 0o700 });
    await writeFile(join(staging, path), content, { mode: 0o600, flag: 'wx' });
  }
  const artifact = join(staging, 'release.json');
  await writeFile(artifact, JSON.stringify(release), { mode: 0o600, flag: 'wx' });
  const { runInstaller } = await import(pathToFileURL(join(staging, 'src/install-cli.ts')).href);
  const args = process.argv.slice(2);
  await runInstaller(args.some(a => ['--list', '--rollback', '--uninstall'].includes(a)) ? args : ['--artifact', artifact, ...args]);
} finally { await rm(staging, { recursive: true, force: true }); }
`;
const filename = `smart-codex-${release.id}-install.mjs`;
await writeFile(resolve(directory, filename), installer, { mode: 0o600, flag: 'wx' });
await writeFile(resolve(directory, 'SHA256SUMS'), `${digest(installer)}  ${filename}\n`, { mode: 0o600, flag: 'wx' });
console.log(`Packaged ${release.id}: ${filename}`);
