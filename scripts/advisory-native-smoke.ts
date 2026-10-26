import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { advisoryHookArgs } from '../src/advisory-hook.ts';
import { commandForEntry, nativeMaintenanceEnv } from '../src/native-runtime.ts';
import type { NativeCommand } from '../src/native-command.ts';

const note = 'ModelRudder synthetic advisory: model unchanged.';
const record = (value: any): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);

export async function probeAdvisoryNative(command: NativeCommand = { file: 'codex', args: [] }, source = process.env) {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-advisory-native-'));
  const env = { ...nativeMaintenanceEnv(source), CODEX_HOME: directory };
  let child: ReturnType<typeof spawn> | undefined;
  let stage = 'version';
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  let resolveWarning: ((value: any) => void) | undefined;
  let rejectWarning: ((error: Error) => void) | undefined;
  let warningTimer: ReturnType<typeof setTimeout> | undefined;
  const fail = () => {
    for (const item of pending.values()) item.reject(new Error('Native protocol failed'));
    pending.clear(); rejectWarning?.(new Error('Native hook failed'));
  };
  try {
    const { stdout } = await promisify(execFile)(command.file, [...command.args, '--version'], { env, timeout: 15000, maxBuffer: 16384 });
    const version = /^codex-cli (\d+\.\d+\.\d+)\s*$/.exec(stdout.trim())?.[1];
    if (!version) throw new Error('Unrecognized version');
    const fixture = join(directory, 'note.mjs');
    await writeFile(fixture, `process.stdout.write(${JSON.stringify(JSON.stringify({ systemMessage: note }))});\n`, { mode: 0o600 });
    const hookArgs = advisoryHookArgs(process.execPath, fixture);
    // A second source proves session flags append instead of replacing user hooks.
    await writeFile(join(directory, 'config.toml'), `${hookArgs[1]}\n`, { mode: 0o600 });
    stage = 'initialize';
    child = spawn(command.file, [...command.args, 'app-server', '--stdio', ...hookArgs,
      '--disable', 'apps', '--disable', 'multi_agent', '-c', 'model_provider="advisory_smoke"',
      '-c', 'model_providers.advisory_smoke={name="Synthetic",base_url="http://127.0.0.1:9/v1",wire_api="responses",requires_openai_auth=false,request_max_retries=0,stream_max_retries=0}'],
    { env, cwd: directory, stdio: ['pipe', 'pipe', 'ignore'] });
    let buffer = '', sequence = 0;
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', chunk => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 1024 * 1024) { fail(); child!.kill(); return; }
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        try {
          const message = JSON.parse(line);
          if (!record(message)) throw new Error('Invalid envelope');
          if (typeof message.id === 'number' && pending.has(message.id)) {
            const item = pending.get(message.id)!; pending.delete(message.id);
            message.error ? item.reject(new Error('Native rejected request')) : item.resolve(message.result);
          } else if (message.method === 'hook/completed' && message.params?.run?.source === 'sessionFlags') {
            resolveWarning?.(message.params);
          }
        } catch { fail(); child!.kill(); }
      }
    });
    child.on('error', fail); child.on('exit', fail); child.stdin!.on('error', fail);
    const request = (method: string, params: unknown): Promise<any> => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Native request timed out')); }, 15000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      child!.stdin!.write(JSON.stringify({ id, method, params }) + '\n');
    });
    await request('initialize', { clientInfo: { name: 'modelrudder_advisory_smoke', version: '1' }, capabilities: { experimentalApi: true } });
    child.stdin!.write('{"method":"initialized","params":{}}\n');
    stage = 'hook-discovery';
    const discovered = await request('hooks/list', { cwds: [directory] });
    const entry = discovered?.data?.[0];
    if (!entry || entry.errors?.length || entry.warnings?.length || !Array.isArray(entry.hooks)) throw new Error('Invalid hooks');
    const hook = entry.hooks.find((item: any) => item.source === 'sessionFlags' && item.eventName === 'userPromptSubmit');
    if (!entry.hooks.some((item: any) => item.source === 'user' && item.eventName === 'userPromptSubmit') ||
        !hook || hook.trustStatus !== 'untrusted' || typeof hook.key !== 'string' || typeof hook.currentHash !== 'string') throw new Error('Missing hook/trust boundary');
    stage = 'fixture-trust';
    // Same scoped trust record as the native UI, written only in disposable CODEX_HOME.
    await request('config/batchWrite', { edits: [{ keyPath: `hooks.state.${JSON.stringify(hook.key)}.trusted_hash`, value: hook.currentHash, mergeStrategy: 'replace' }] });
    const trusted = await request('hooks/list', { cwds: [directory] });
    if (!trusted?.data?.[0]?.hooks?.some((item: any) => item.key === hook.key && item.trustStatus === 'trusted')) throw new Error('Trust not applied');
    stage = 'thread-start';
    const thread = await request('thread/start', { cwd: directory, model: 'gpt-6.1-sol', modelProvider: 'advisory_smoke',
      approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true });
    if (typeof thread?.thread?.id !== 'string' || thread.model !== 'gpt-6.1-sol' || thread.sandbox?.type !== 'readOnly') throw new Error('Native settings changed');
    stage = 'native-warning';
    const warning = new Promise<any>((resolve, reject) => {
      resolveWarning = resolve; rejectWarning = reject;
      warningTimer = setTimeout(() => reject(new Error('Native warning timed out')), 15000);
    });
    warning.catch(() => {});
    await request('turn/start', { threadId: thread.thread.id, input: [{ type: 'text', text: 'Synthetic advisory hook check.', text_elements: [] }] });
    const event = await warning;
    if (event.threadId !== thread.thread.id || event.run?.status !== 'completed' || event.run?.eventName !== 'userPromptSubmit' ||
        !event.run.entries?.some((item: any) => item.kind === 'warning' && item.text === note) ||
        event.run.entries.some((item: any) => item.kind !== 'warning')) throw new Error('Unexpected native output');
    return { ok: true, version, checks: ['existing-hook-preserved', 'native-trust-required', 'scoped-fixture-trust', 'native-warning-event', 'native-model-preserved', 'read-only-permissions'],
      inferenceCalls: 0, nativeTuiCertified: false };
  } catch { throw new Error(`Advisory native smoke failed at ${stage}; no external provider was configured.`); }
  finally {
    clearTimeout(warningTimer); fail();
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close').catch(() => {});
      child.kill('SIGTERM'); const timer = setTimeout(() => child!.kill('SIGKILL'), 1000);
      await closed; clearTimeout(timer);
    }
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3) { console.error('Usage: advisory-native-smoke.ts [path-to-official-codex]'); process.exitCode = 1; }
  else try { console.log(JSON.stringify(await probeAdvisoryNative(process.argv[2] ? commandForEntry(process.argv[2]) : undefined))); }
  catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
