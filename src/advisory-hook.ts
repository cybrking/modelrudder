import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { recommend } from './advisory.ts';
import { isPrivatePath, protectPrivatePath } from './private-files.ts';
import { withDeadline } from './classifier-contract.ts';

// Hooks are discovered per config layer; session flags do not replace user/project hooks.
export function advisoryHookArgs(node = process.execPath, script = fileURLToPath(import.meta.url)) {
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  const command = `${quote(node)} -- ${quote(script)}`;
  const psQuote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const ps = `& ${psQuote(node)} -- ${psQuote(script)}`;
  const windows = `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, 'utf16le').toString('base64')}`;
  return ['-c', `hooks.UserPromptSubmit=[{hooks=[{type="command",command=${JSON.stringify(command)},commandWindows=${JSON.stringify(windows)},timeout=3}]}]`];
}

export async function advisoryHook(raw: unknown, directory: string,
  recommendNote: (task: string, model: string) => Promise<string | null>, signal?: AbortSignal,
  checkPrivate = isPrivatePath): Promise<{ systemMessage: string } | null> {
  try {
    signal?.throwIfAborted();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const event = raw as Record<string, unknown>;
    if (event.hook_event_name !== 'UserPromptSubmit' || event.agent_id !== undefined ||
        typeof event.session_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(event.session_id) ||
        typeof event.model !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(event.model) ||
        typeof event.prompt !== 'string' || !event.prompt.trim() || event.prompt.length > 64000 ||
        /^\s*[!/]/.test(event.prompt) || /(^|\s)@\S/.test(event.prompt) ||
        !await checkPrivate(directory, true, signal)) return null;
    signal?.throwIfAborted();
    const path = join(directory, `advisory-${createHash('sha256').update(event.session_id).digest('hex')}.json`);
    let previous: unknown;
    try {
      if (lstatSync(path).size > 4096 || !await checkPrivate(path, false, signal)) return null;
      signal?.throwIfAborted();
      previous = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return null;
    }
    const note = await recommendNote(event.prompt, event.model);
    signal?.throwIfAborted();
    if (note !== null && (typeof note !== 'string' || note.length > 1024 || /[\x00-\x1f\x7f]/.test(note))) return null;
    if (note === null && previous && typeof previous === 'object' && 'model' in previous && previous.model === event.model) return null;
    const current = JSON.stringify({ model: event.model, note });
    if (JSON.stringify(previous) === current) return null;
    // Only model and note persist, in the launcher's private temporary directory.
    const temporary = `${path}.${randomUUID()}`;
    writeFileSync(temporary, current, { mode: 0o600, flag: 'wx' });
    try {
      // Windows can assign a new file the Administrators owner despite a private parent ACL.
      await protectPrivatePath(temporary, false, signal);
      signal?.throwIfAborted();
      renameSync(temporary, path);
    } finally { rmSync(temporary, { force: true }); }
    return note ? { systemMessage: note } : null;
  } catch { return null; }
}

export async function runAdvisoryHook(input: AsyncIterable<Uint8Array>, env = process.env,
  parent?: AbortSignal, checkPrivate = isPrivatePath): Promise<string> {
  try {
    return await withDeadline(2500, async signal => {
      const config = env.MODEL_RUDDER_ADVISORY_ENV_FILE;
      const directory = env.MODEL_RUDDER_ADVISORY_STATE_DIR;
      if (!config || !directory || !await checkPrivate(config, false, signal) || lstatSync(config).size > 64000) return '';
      signal.throwIfAborted();
      const classifierEnv = parseEnv(readFileSync(config, 'utf8'));
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of input) {
        signal.throwIfAborted();
        size += chunk.byteLength;
        if (size > 256000) return '';
        chunks.push(Buffer.from(chunk));
      }
      const result = await advisoryHook(JSON.parse(Buffer.concat(chunks).toString('utf8')), directory,
        (task, model) => recommend('codex', task, model, classifierEnv, undefined, signal), signal, checkPrivate);
      return result ? JSON.stringify(result) + '\n' : '';
    }, parent);
  } catch { return ''; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Late transport handles must not keep this hook alive past the native timeout.
  try { process.stdout.write(await runAdvisoryHook(process.stdin), () => process.exit(0)); }
  finally { process.stdin.destroy(); }
}
