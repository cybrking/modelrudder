import { spawn } from 'node:child_process';
import { mkdir, lstat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { defaultInstallOptions } from './install-cli.ts';
import { isPrivatePathSync, protectPrivatePathSync } from './private-files.ts';

export const setupTemplate = "# Run smart-codex setup to create/open your private installed configuration.\n# All settings below are disabled until you explicitly uncomment them.\n# Jev account signup/login and API keys: https://console.typesafe.ai/keys\n# Official instructions: https://docs.typesafe.ai/introduction/quickstart\n# Provider fees are separate from this free software and your Codex subscription.\n# Enter your own key in this local file; never paste it into agent chat or commit it.\n# TYPESAFE_API_KEY=\n# Observe/auto classification sends your task text and bounded earlier excerpts to TypeSafe.\n# Uncomment the consent setting only after reviewing the README data flow.\n# ALLOW_JEV_CLASSIFICATION=true\n# SMART_CODEX_CLASSIFIER=direct\n";

async function openEditor(path: string): Promise<void> {
  const command = process.platform === 'win32' ? 'notepad.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'darwin' ? ['-t', path] : [path];
  await new Promise<void>((done, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', shell: false });
    child.once('error', () => reject(new Error('Could not start editor; open the configuration path manually.')));
    child.once('spawn', () => { child.unref(); done(); });
  });
}

export async function runSetup(args: string[], env: NodeJS.ProcessEnv = process.env,
  out = (text: string) => process.stdout.write(text), editor = openEditor): Promise<number> {
  if (args.length && !(args.length === 1 && args[0] === '--no-open')) throw new Error('Setup accepts only --no-open.');
  const file = resolve(env.SMART_CODEX_ENV_FILE || defaultInstallOptions().envFile);
  let existing;
  try { existing = await lstat(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (existing) {
    if (!existing.isFile() || existing.isSymbolicLink() || !isPrivatePathSync(file)) throw new Error('Existing configuration must be a private regular file; it was not modified.');
  } else {
    const parent = dirname(file);
    let parentInfo;
    try { parentInfo = await lstat(parent); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (parentInfo && (!parentInfo.isDirectory() || parentInfo.isSymbolicLink())) throw new Error('Configuration directory must be a real directory.');
    if (!parentInfo) { await mkdir(parent, { recursive: true, mode: 0o700 }); protectPrivatePathSync(parent, true); }
    await writeFile(file, setupTemplate, { flag: 'wx', mode: 0o600 });
    protectPrivatePathSync(file);
  }
  out('Local configuration: ' + file + '\nJev signup and API keys: https://console.typesafe.ai/keys\n');
  out(existing ? 'Existing configuration preserved.\n' : 'Created a fully commented template; classification remains disabled.\n');
  out('Enter your key only in this file, then explicitly uncomment the consent and provider settings. Never paste the key into agent chat.\n');
  if (!args.includes('--no-open')) { await editor(file); out('Started the editor for your local configuration.\n'); }
  return 0;
}
