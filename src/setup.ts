import { spawn } from 'node:child_process';
import { mkdir, lstat, writeFile, readFile, rename, rm } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { readClassifierConfig, classificationEnabled, classifierNotice } from './classifier.ts';
import { dirname, resolve } from 'node:path';
import { defaultInstallOptions } from './install-cli.ts';
import { isPrivatePathSync, protectPrivatePathSync } from './private-files.ts';

export const setupTemplate = "TYPESAFE_API_KEY=\nALLOW_JEV_CLASSIFICATION=false\nSMART_CODEX_CLASSIFIER=direct\n";

// Catch immediate launcher failures without waiting for a GUI editor to close.
export async function startEditor(command: string, args: string[]): Promise<void> {
  await new Promise<void>((done, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', shell: false });
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (failed: boolean) => {
      if (settled) return;
      settled = true; clearTimeout(timer); child.unref();
      if (failed) reject(new Error('Could not start editor; open the configuration path manually.'));
      else done();
    };
    child.once('error', () => finish(true));
    child.once('exit', (code, signal) => finish(code !== 0 || signal !== null));
    child.once('spawn', () => { timer = setTimeout(() => finish(false), 2000); });
  });
}

async function openEditor(path: string): Promise<void> {
  const command = process.platform === 'win32' ? 'notepad.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'darwin' ? ['-t', path] : [path];
  await startEditor(command, args);
}

type SetupChoice = 'jev' | 'edit' | 'keep';

async function promptSetup(current: string, out: (text: string) => void): Promise<SetupChoice> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    out(`Routing provider: ${current}\n\n1. Jev — hosted; sends eligible task text to TypeSafe; requires your key and consent\n2. Edit private configuration\n\nThis choice applies to new Codex and Claude sessions. Native execution still uses your provider account.\n`);
    while (true) {
      const choice = (await terminal.question('Choose [1/2], or Enter to keep current settings: ')).trim().toLowerCase();
      if (choice === '1' || choice === 'jev') return 'jev';
      if (choice === '2' || choice === 'edit') return 'edit';
      if (['', 'keep', 'later', 'q'].includes(choice)) return 'keep';
      out('Choose 1 for Jev, 2 to edit, or Enter to keep current settings.\n');
    }
  } finally { terminal.close(); }
}

export async function runSetup(args: string[], env: NodeJS.ProcessEnv = process.env,
  out = (text: string) => process.stdout.write(text), editor = openEditor,
  prompt: ((current: string, out: (text: string) => void) => Promise<SetupChoice>) | undefined =
    process.stdin.isTTY && process.stdout.isTTY ? promptSetup : undefined): Promise<number> {
  let provider: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-open') continue;
    if (args[i] === '--classifier' && !provider && args[i + 1] === 'jev') provider = args[++i];
    else throw new Error('Setup accepts only --no-open and --classifier jev.');
  }
  const file = resolve(env.SMART_CODEX_ENV_FILE || defaultInstallOptions().envFile);
  let existing;
  try { existing = await lstat(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const oldText = existing ? await readFileChecked(file) : setupTemplate;
  const saved = parseEnv(oldText);
  if (!provider && !args.includes('--no-open') && prompt) {
    const current = !existing ? 'Not configured' : saved.SMART_CODEX_CLASSIFIER === 'tev' ? 'Unsupported legacy provider; configure Jev'
      : saved.SMART_CODEX_CLASSIFIER === 'hosted' ? 'Jev (hosted gateway)'
      : !saved.SMART_CODEX_CLASSIFIER || ['direct', 'jev'].includes(saved.SMART_CODEX_CLASSIFIER) ? 'Jev (hosted)' : 'Unrecognized provider';
    const choice = await prompt(current, out);
    if (choice === 'keep') {
      out('Configuration unchanged.\n');
      if ((env.SMART_CODEX_CLASSIFIER ?? saved.SMART_CODEX_CLASSIFIER) === 'tev') {
        out('TEV is no longer supported. Run setup --classifier jev to migrate; pinned mode remains available.\n');
        return 1;
      }
      return 0;
    }
    if (choice === 'jev') provider = choice;
  }
  const jevReady = Boolean((env.TYPESAFE_API_KEY ?? saved.TYPESAFE_API_KEY)?.trim()) &&
    (env.ALLOW_JEV_CLASSIFICATION ?? saved.ALLOW_JEV_CLASSIFICATION) === 'true';
  if (provider) {
    if (env.SMART_CODEX_CLASSIFIER && env.SMART_CODEX_CLASSIFIER !== saved.SMART_CODEX_CLASSIFIER && env.SMART_CODEX_CLASSIFIER !== 'direct' && env.SMART_CODEX_CLASSIFIER !== provider) {
      throw new Error('Setup blocked by an environment classifier override; unset SMART_CODEX_CLASSIFIER and retry. Configuration unchanged.');
    }
    if ((saved.SMART_CODEX_CLASSIFIER === 'tev' || saved.SMART_CODEX_CLASSIFIER === 'hosted') && !jevReady) {
      const previous = saved.SMART_CODEX_CLASSIFIER === 'tev' ? 'Tev' : 'Jev gateway';
      out(`Jev is not ready; ${previous} selection preserved. Open ${file} privately, enter TYPESAFE_API_KEY and set ALLOW_JEV_CLASSIFICATION=true after reviewing hosted data flow, then rerun setup and choose Jev. Never paste the key into chat.\n`);
      if (!args.includes('--no-open')) await editor(file);
      return 1;
    }
  }
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
  if (provider) {
    const updates = { SMART_CODEX_CLASSIFIER: 'direct' };
    const retiredKeys = ['SMART_CODEX_TEV_URL', 'SMART_CODEX_TEV_MODEL'];
    let next = oldText;
    for (const key of retiredKeys) next = next.replace(new RegExp('^[ \t]*(?:export\\s+)?' + key + '\\s*=.*(?:\\r?\\n|$)', 'gm'), '');
    for (const [key, value] of Object.entries(updates)) {
      next = next.replace(new RegExp('^[ \t]*(?:export\\s+)?' + key + '\\s*=.*(?:\\r?\\n|$)', 'gm'), '');
      next += `${next.endsWith('\n') ? '' : '\n'}${key}=${value}\n`;
    }
    const parsed = parseEnv(next);
    if (Object.entries(updates).some(([key, value]) => parsed[key] !== value) || retiredKeys.some(key => key in parsed)) throw new Error('Setup cannot safely update this configuration; edit it privately.');
    for (const [key, value] of Object.entries(saved)) {
      if (!(key in updates) && !retiredKeys.includes(key) && parsed[key] !== value) throw new Error('Setup cannot safely update this configuration; edit it privately.');
    }
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, next, { flag: 'wx', mode: 0o600 }); protectPrivatePathSync(temp);
      await rename(temp, file);
    } finally { await rm(temp, { force: true }); }
    out(`Saved Jev (hosted) for both launchers. Restart sessions to apply. Native login and unrelated settings preserved.\n`);
    if ((env.ALLOW_CLASSIFICATION ?? saved.ALLOW_CLASSIFICATION) === 'false') {
      out('Classification remains disabled by ALLOW_CLASSIFICATION=false. Change that setting explicitly when ready to enable routing.\n');
      return 0;
    }
    if (jevReady) {
      out('Hosted classification enabled. Start a new smart-codex or smart-claude session to use Jev.\n');
      return 0;
    }
  }
  if (!provider && (env.SMART_CODEX_CLASSIFIER ?? saved.SMART_CODEX_CLASSIFIER) === 'tev') {
    out(`Local configuration: ${file}\nTEV is no longer supported. Run setup --classifier jev after adding your private key and ALLOW_JEV_CLASSIFICATION=true. Configuration unchanged; pinned mode remains available.\n`);
    if (!args.includes('--no-open')) await editor(file);
    return 1;
  }
  out('Local configuration: ' + file + '\nJev signup and API keys: https://console.typesafe.ai/keys\n');
  out(provider ? 'Hosted classification still requires your explicit Jev consent.\n' : existing ? 'Existing configuration preserved.\n' : 'Created a minimal configuration; classification remains disabled.\n');
  out('Enter your key only in this file. After reviewing the README data flow, change ALLOW_JEV_CLASSIFICATION to true. Never paste the key into agent chat.\n');
  if (!args.includes('--no-open')) { await editor(file); out('Requested the local editor. If no window opens, open the configuration path manually.\n'); }
  return 0;
}

async function readFileChecked(file: string) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || !isPrivatePathSync(file)) throw new Error('Existing configuration must be a private regular file; it was not modified.');
  return readFile(file, 'utf8');
}

export async function classifierStatus(env: NodeJS.ProcessEnv): Promise<{ ok: boolean; text: string }> {
  try {
    readClassifierConfig(env);
    const enabled = classificationEnabled(env);
    const detail = 'Credentials configured; not tested remotely.';
    return { ok: enabled, text: `${classifierNotice(env)}\nClassification: ${enabled ? 'enabled' : 'disabled; complete setup or use pinned mode'}.\n${detail}\nSelection uses the effective environment (explicit exports override the shared file); --classifier overrides one session. No inference submitted.\n` };
  } catch {
    return { ok: false, text: 'Routing provider configuration is invalid or incomplete. Run setup --classifier jev. Pinned mode remains available.\n' };
  }
}
