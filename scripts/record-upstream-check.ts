import { readFile, writeFile } from 'node:fs/promises';
const { CLI_PROVIDER: provider, CLI_VERSION: version, CLI_OS: os, GITHUB_SHA: sourceSha } = process.env;
if (!['codex', 'claude'].includes(provider ?? '') || !/^\d+\.\d+\.\d+$/.test(version ?? '')
  || !['ubuntu-latest', 'macos-latest', 'windows-latest'].includes(os ?? '') || !/^[a-f0-9]{40}$/.test(sourceSha ?? '')) {
  throw new Error('Invalid upstream evidence metadata');
}
const native = JSON.parse(await readFile('.upstream-check/native.json', 'utf8'));
await writeFile('validation.json', `${JSON.stringify({ provider, version, os, sourceSha, native }, null, 2)}\n`);
