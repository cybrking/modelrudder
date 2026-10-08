import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { doctorChildEnv } from '../src/doctor.ts';
import { codexCompatibility } from '../src/compatibility.ts';
import { codexCommand } from '../src/native-command.ts';

// Explicit local compatibility check. Never submits a turn or calls a classifier.
const directory = await mkdtemp(join(tmpdir(), 'smart-native-protocol-'));
const env = doctorChildEnv(process.env);
let child: ReturnType<typeof spawn> | undefined;
let stage = 'version';
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
try {
  const command = await codexCommand(env);
  const { stdout } = await promisify(execFile)(command.file, [...command.args, '--version'], { env, timeout: 15_000, maxBuffer: 16_384 });
  const compatibility = codexCompatibility(stdout);
  if (!compatibility.version) throw new Error('Unrecognized native version');
  stage = 'backend-start';
  child = spawn(command.file, [...command.args, 'app-server', '--stdio', '--disable', 'apps', '--disable', 'hooks', '--disable', 'multi_agent',
    '-c', 'model_provider="openai"'], { cwd: directory, env, stdio: ['pipe', 'pipe', 'ignore'] });
  const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let buffer = '', sequence = 0;
  child.stdout!.setEncoding('utf8');
  child.stdout!.on('data', chunk => {
    buffer += chunk;
    if (Buffer.byteLength(buffer) > 1024 * 1024) { child!.kill(); return; }
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      try {
        const message: unknown = JSON.parse(line);
        if (!record(message)) throw new Error('Invalid native envelope');
        const pending = typeof message.id === 'number' ? waiting.get(message.id) : undefined;
        if (pending) { waiting.delete(message.id as number); message.error ? pending.reject(new Error('Native protocol rejected request')) : pending.resolve(message.result); }
      } catch { child!.kill(); }
    }
  });
  child.on('error', () => { for (const p of waiting.values()) p.reject(new Error('Native backend unavailable')); });
  child.stdin!.on('error', () => { for (const p of waiting.values()) p.reject(new Error('Native input closed')); });
  child.on('exit', () => { for (const p of waiting.values()) p.reject(new Error('Native backend exited')); });
  const request = (method: string, params: unknown) => new Promise<unknown>((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('Native protocol timed out')); }, 15_000);
    waiting.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    child!.stdin!.write(`${JSON.stringify({ id, method, params })}\n`);
  });
  stage = 'initialize';
  const initialized = await request('initialize', { clientInfo: { name: 'smart_router_protocol_smoke', version: '1' },
    capabilities: { experimentalApi: true } });
  stage = 'initialize-response';
  if (!record(initialized) || typeof initialized.userAgent !== 'string') throw new Error('Invalid initialization response');
  child.stdin!.write('{"method":"initialized","params":{}}\n');
  stage = 'thread-start';
  const thread = await request('thread/start', { cwd: directory, model: 'gpt-6.1-sol',
    approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true });
  stage = 'thread-response';
  if (!record(thread) || !record(thread.thread) || typeof thread.thread.id !== 'string' || thread.model !== 'gpt-6.1-sol' ||
      thread.approvalPolicy !== 'never' || !record(thread.sandbox) || thread.sandbox.type !== 'readOnly') throw new Error('Invalid thread response');
  console.log(JSON.stringify({ ok: true, version: compatibility.version,
    checks: ['stdio-initialize', 'fresh-thread-start', 'model-setting', 'read-only-permissions'], inferenceCalls: 0,
    nativeTuiCertified: false }));
} catch {
  console.error(`Native protocol smoke failed at ${stage}; no turn was submitted.`); process.exitCode = 1;
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const closed = once(child, 'close').catch(() => {});
    child.kill('SIGTERM'); const timer = setTimeout(() => child!.kill('SIGKILL'), 1000);
    await closed; clearTimeout(timer);
  }
  await rm(directory, { recursive: true, force: true });
}
