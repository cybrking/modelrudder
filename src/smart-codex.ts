import { codexCompatibility, protocolTestedCodexVersions } from './compatibility.ts';
import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import { createConfiguredClassifier, readClassifierConfig } from './classifier.ts';
import { routes } from './config.ts';
import { createTurnRelay } from './turn-relay.ts';
import type { RoutingMode } from './turn-relay.ts';
import { effortModes } from './types.ts';
import type { Classifier, EffortMode } from './types.ts';
import { createSessionUsage, formatSessionUsage } from './session-usage.ts';
import { createUsageLog, monitorUsage, runLogCleanup } from './usage-log.ts';
import { parseDecision } from './policy.ts';
import { runUsageReport } from './usage-report.ts';
import { createRuntimePolicy, routerVersion } from './runtime-policy.ts';
import type { RuntimePolicy } from './runtime-policy.ts';
import { runDoctor } from './doctor.ts';
import { accountStatus } from './account-status.ts';
import { runOutcomeCommand } from './outcome.ts';
import { codexCommand } from './native-command.ts';
import type { NativeCommand } from './native-command.ts';
import { runSetup } from './setup.ts';

export const smartCodexHelp = `Usage: smart-codex [--routing auto|observe|pinned] [--effort-mode fixed|observe|auto] [Codex options] [PROMPT]
       smart-codex resume --last
       smart-codex monitor
       smart-codex report [--format markdown|json] [--decisions] [--output FILE]
       smart-codex doctor
       smart-codex setup [--no-open]
       smart-codex account
       smart-codex outcome --result accepted|rejected [--review-minutes N] [--file SESSION.jsonl]
       smart-codex logs cleanup --older-than-days DAYS [--apply]

Opens the native interactive Codex CLI with a private local routing relay.
auto (default): experimental Jev model selection at each new user turn.
observe: Jev recommends; GPT-6.1 Sol executes every turn.
pinned: no Jev calls; use --model gpt-6-luna, gpt-6.1-sol, or gpt-6-astra.
An explicit --model/-m selects pinned mode unless --routing is supplied.
--effort-mode fixed: always medium effort.
--effort-mode observe: record proposed effort, execute medium.
--effort-mode auto (default): experimental FAST Luna/low; other profiles medium.
Model observe, pinned and fallback turns stay medium. Selection is fixed per turn.
Auto overrides the /model picker at new turns.
Plain codex is unchanged. Jev receives each task and up to two earlier task
excerpts from this launcher; images, files, and assistant output are not sent.
Requires Codex CLI with --remote support, ChatGPT login, Node 24+, and configured
ALLOW_JEV_CLASSIFICATION=true and direct Jev or hosted gateway credentials.
Use --help for this help; other interactive Codex options pass through.
Usage appears on exit; monitor shows live metadata in a second terminal.
`;

export function smartCodexChildEnv(source: NodeJS.ProcessEnv) {
  const env = { ...source };
  for (const key of ['TYPESAFE_API_KEY', 'ALLOW_JEV_CLASSIFICATION', 'ROUTER_MODE',
    'SMART_CODEX_CLASSIFIER', 'SMART_CODEX_GATEWAY_URL', 'SMART_CODEX_GATEWAY_TOKEN',
    'SMART_CODEX_ADMIN_TOKEN', 'SMART_CODEX_AUTH_CLIENT_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
    'SMART_CODEX_CUSTOMERS', 'SMART_CODEX_QUOTA_URL', 'SMART_CODEX_QUOTA_TOKEN', 'SMART_CODEX_QUOTA_NAMESPACE',
    'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_ORG_ID', 'OPENAI_PROJECT_ID', 'MODEL_RUDDER_RELAY_TOKEN']) delete env[key];
  return env;
}

export function parseSmartCodexArgs(args: string[], cwd: string) {
  let mode: RoutingMode = 'auto'; let explicitMode = false;
  let effortMode: EffortMode = 'auto'; let explicitEffortMode = false;
  let model = routes.DEEP.model; let explicitModel = false;
  let directory = cwd;
  const tui: string[] = []; const server: string[] = [];
  const valueOptions = new Set(['-m', '--model', '-C', '--cd', '-c', '--config', '--enable', '--disable',
    '-s', '--sandbox', '-a', '--ask-for-approval', '--add-dir', '-i', '--image', '--remote-auth-token-env', '-p', '--profile']);
  const forbidden = new Set(['exec', 'e', 'app', 'app-server', 'login', 'logout', 'mcp', 'plugin', 'review',
    'update', 'doctor', 'sandbox', 'debug', 'completion', 'agents', 'remote-control', 'queue', 'archive', 'delete',
    'migrate-rollouts', 'unarchive', 'cloud', 'exec-server', 'features', 'help', 'apply']);
  let positional = false;
  for (let i = 0; i < args.length; i++) {
    const raw = args[i];
    if (raw === '--') { tui.push(...args.slice(i)); break; }
    const equals = raw.indexOf('=');
    const name = equals > 0 ? raw.slice(0, equals) : raw;
    if (name === '--remote' || name === '--remote-auth-token-env' || name === '-p' || name === '--profile') {
      throw new Error(`${name} is not supported by smart-codex`);
    }
    if (name === '--routing' || name === '--effort-mode' || valueOptions.has(name)) {
      const value = equals > 0 ? raw.slice(equals + 1) : args[++i];
      if (!value) throw new Error(`${name} requires a value`);
      if (name === '--effort-mode') {
        if (explicitEffortMode || !effortModes.includes(value as EffortMode)) throw new Error('Invalid --effort-mode; use fixed, observe or auto once');
        effortMode = value as EffortMode; explicitEffortMode = true; continue;
      }
      if (name === '--routing') {
        if (!['auto', 'observe', 'pinned'].includes(value)) throw new Error('Invalid --routing mode');
        mode = value as RoutingMode; explicitMode = true; continue;
      }
      if (name === '-m' || name === '--model') { model = value; explicitModel = true; }
      if (name === '-C' || name === '--cd') directory = resolve(cwd, value);
      if (['-c', '--config', '--enable', '--disable'].includes(name)) {
        const configKey = value.split('=')[0].trim();
        if (['forced_login_method', 'model_provider', 'openai_base_url', 'chatgpt_base_url'].includes(configKey) ||
            configKey.startsWith('model_providers.')) {
          throw new Error('Provider/authentication overrides are not supported');
        }
        server.push(name, value);
      }
      tui.push(name, value);
    } else {
      if (!raw.startsWith('-') && !positional) {
        if (forbidden.has(raw)) throw new Error('Use plain codex for noninteractive commands');
        positional = true;
      }
      tui.push(raw);
    }
  }
  if (explicitModel && !explicitMode) mode = 'pinned';
  const runtimePolicy = createRuntimePolicy({ mode, model, effortMode });
  return { mode, model, directory, tui, server, runtimePolicy };
}

export function nativeTuiArgs(tui: string[], socketPath: string, model: string) {
  return nativeRemoteTuiArgs(tui, `unix://${socketPath}`, model);
}

export function nativeRemoteTuiArgs(tui: string[], endpoint: string, model: string, authEnv?: string) {
  const boundary = tui.indexOf('--');
  const index = boundary === -1 ? tui.length : boundary;
  return [...tui.slice(0, index), '--remote', endpoint, ...(authEnv ? ['--remote-auth-token-env', authEnv] : []), ...subscriptionConfig,
    '-c', `model=${JSON.stringify(model)}`, ...tui.slice(index)];
}

const subscriptionConfig = ['-c', 'forced_login_method="chatgpt"', '-c', 'model_provider="openai"',
  '-c', 'model_reasoning_effort="medium"'];

// Unix sockets use a mode-0700 parent; Windows uses authenticated loopback TCP.
// The official child retains ownership of Codex login.
export async function startSmartRelay(options: {
  socketPath?: string; localToken?: string; cwd: string; env: NodeJS.ProcessEnv; serverArgs?: string[];
  mode: RoutingMode; model: string; classifier?: Classifier; binary?: string;
  runtimePolicy?: RuntimePolicy; command?: NativeCommand;
  onRoute?: (metadata: Record<string, unknown>) => void;
  onFailure?: (reason: string) => void;
  onThread?: (id: string) => void;
  onClient?: (message: Record<string, any>) => void;
  onServer?: (message: Record<string, any>) => void;
}) {
  if (Boolean(options.socketPath) === Boolean(options.localToken)) throw new Error('Select one private relay transport.');
  if (options.localToken && !/^[a-f0-9]{64}$/.test(options.localToken)) throw new Error('Invalid local relay token.');
  const command = options.command ?? (options.binary ? { file: options.binary, args: [] } : await codexCommand(options.env));
  const runtimePolicy = createRuntimePolicy(options.runtimePolicy ?? { mode: options.mode, model: options.model });
  const http = createServer((_request, response) => { response.writeHead(404).end(); });
  const maxFrameBytes = 64 * 1024 * 1024;
  const wss = new WebSocketServer({ noServer: true, maxPayload: maxFrameBytes, perMessageDeflate: false });
  const sessions = new Set<() => Promise<void>>();
  let closing = false;
  http.on('upgrade', (request, socket, head) => {
    if (closing || request.headers.origin || sessions.size > 0) { socket.destroy(); return; }
    if (options.localToken) {
      const supplied = Buffer.from(request.headers.authorization ?? '');
      const expected = Buffer.from(`Bearer ${options.localToken}`);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected) || request.url !== '/') {
        socket.destroy(); return;
      }
    }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    const child = spawn(command.file, [...command.args, 'app-server', '--stdio', ...(options.serverArgs ?? []),
      ...subscriptionConfig, '-c', `model=${JSON.stringify(runtimePolicy.model)}`],
    { cwd: options.cwd, env: smartCodexChildEnv(options.env), stdio: ['pipe', 'pipe', 'ignore'] });
    let stopped = false;
    let stopping: Promise<void> | undefined;
    let input = '';
    const send = (message: Record<string, unknown>) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (ws.bufferedAmount > maxFrameBytes) { void stop('client_backpressure'); return; }
      ws.send(JSON.stringify(message));
    };
    const relay = createTurnRelay({ mode: runtimePolicy.mode, model: runtimePolicy.model, runtimePolicy, classifier: options.classifier, onThread: options.onThread,
      onRoute: options.onRoute, downstream: send, upstream(message) {
        if (stopped) return;
        if (child.stdin.writableLength > maxFrameBytes) { void stop('backend_backpressure'); return; }
        options.onClient?.(message);
        child.stdin.write(`${JSON.stringify(message)}\n`);
      } });
    function stop(reason?: string): Promise<void> {
      if (stopping) return stopping;
      if (reason) options.onFailure?.(reason);
      stopped = true; relay.close(); ws.terminate(); child.stdin.destroy(); child.kill('SIGTERM');
      stopping = new Promise<void>(done => {
        if (child.exitCode !== null || child.signalCode !== null) { done(); return; }
        const timer = setTimeout(() => { child.kill('SIGKILL'); done(); }, 1500);
        child.once('close', () => { clearTimeout(timer); done(); });
      }).then(() => { sessions.delete(stop); });
      return stopping;
    }
    sessions.add(stop);
    child.on('error', () => { void stop('backend_start'); });
    child.on('exit', (code, signal) => { void stop(`backend_exit:${code ?? signal}`); });
    child.stdin.on('error', () => { void stop('backend_input'); });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      input += chunk;
      let newline: number;
      while ((newline = input.indexOf('\n')) !== -1) {
        const line = input.slice(0, newline); input = input.slice(newline + 1);
        if (Buffer.byteLength(line) > maxFrameBytes) { void stop('backend_frame_limit'); return; }
        if (!line.trim()) continue;
        try { const message = JSON.parse(line); options.onServer?.(message); relay.server(message); } catch { void stop('backend_protocol'); return; }
      }
      if (Buffer.byteLength(input) > maxFrameBytes) void stop('backend_frame_limit');
    });
    ws.on('message', (data, binary) => {
      if (binary) { void stop('binary_message'); return; }
      try {
        const message = JSON.parse(data.toString());
        if (!message || typeof message !== 'object' || Array.isArray(message)) { void stop(); return; }
        void relay.client(message).catch(() => { void stop('routing_protocol'); });
      } catch { void stop('client_protocol'); }
    });
    ws.on('close', code => { void stop(closing || code === 1000 || code === 1005 ? undefined : `client_close:${code}`); });
    ws.on('error', () => { void stop('client_socket'); });
  });
  try {
    await new Promise<void>((done, reject) => {
      http.once('error', reject);
      if (options.socketPath) http.listen(options.socketPath, done);
      else http.listen(0, '127.0.0.1', done);
    });
    if (options.socketPath) await chmod(options.socketPath, 0o600);
  } catch (error) {
    http.close(); wss.close(); throw error;
  }
  const address = http.address();
  const endpoint = options.socketPath ? `unix://${options.socketPath}` :
    address && typeof address !== 'string' ? `ws://127.0.0.1:${address.port}` : '';
  return { endpoint, async close() {
    closing = true;
    await Promise.all([...sessions].map(stop => stop()));
    wss.close();
    await new Promise<void>(done => http.close(() => done()));
  } };
}

export async function launchSmartCodex(args: string[], env = process.env): Promise<number> {
  if (args[0] === 'setup') return runSetup(args.slice(1), env);
  if (args[0] === 'logs' && args[1] === 'cleanup') return runLogCleanup(args.slice(2));
  if (args[0] === 'outcome') return runOutcomeCommand(args.slice(1));
  if (args[0] === 'account') {
    if (args.length !== 1) throw new Error('Usage: smart-codex account');
    process.stdout.write(`${JSON.stringify(await accountStatus(process.env), null, 2)}\n`);
    return 0;
  }
  if (args[0] === 'doctor') {
    const { runtimePolicy } = parseSmartCodexArgs(args.slice(1), process.cwd());
    const result = await runDoctor(env, undefined, runtimePolicy);
    process.stdout.write(result.text); return result.ok ? 0 : 1;
  }
  if (args[0] === 'report') return runUsageReport(args.slice(1));
  if (args[0] === 'monitor') { await monitorUsage(args[1]); return 0; }
  const separator = args.indexOf('--');
  const optionArgs = separator < 0 ? args : args.slice(0, separator);
  if (optionArgs.includes('--help') || optionArgs.includes('-h')) { process.stdout.write(smartCodexHelp); return 0; }
  if (optionArgs.includes('--version') || optionArgs.includes('-V')) {
    process.stdout.write(`smart-codex ${routerVersion}\n`);
    return 0;
  }
  const parsed = parseSmartCodexArgs(args, process.cwd());
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('smart-codex requires an interactive terminal; use smart-code for scripts');
  if (parsed.runtimePolicy.policy.allowClassification) {
    if (env.ALLOW_JEV_CLASSIFICATION !== 'true') throw new Error('Configure ALLOW_JEV_CLASSIFICATION=true and classifier credentials in the selected environment file, or use --routing pinned');
    readClassifierConfig(env);
  }
  const command = await codexCommand(smartCodexChildEnv(env));
  await new Promise<void>((done, reject) => {
    execFile(command.file, [...command.args, '--version'], { env: smartCodexChildEnv(env), timeout: 15_000, maxBuffer: 16_384 }, (error, stdout) => {
      if (error || !codexCompatibility(stdout).protocolTested) reject(new Error(`Unsupported Codex CLI version; use a protocol-tested build (${protocolTestedCodexVersions.join(', ')}). Native TUI certification is pending.`));
      else done();
    });
  });
  await new Promise<void>((done, reject) => {
    execFile(command.file, [...command.args, 'login', 'status'],
      { env: smartCodexChildEnv(env), timeout: 10_000, maxBuffer: 64 * 1024 }, (error, stdout, stderr) => {
        if (error || !`${stdout}\n${stderr}`.includes('Logged in using ChatGPT')) reject(new Error('ChatGPT subscription login required; run codex login'));
        else done();
      });
  });
  const directory = await mkdtemp(join(tmpdir(), 'smart-codex-'));
  let relay: Awaited<ReturnType<typeof startSmartRelay>> | undefined;
  let threadId: string | undefined;
  const usage = createSessionUsage();
  const log = createUsageLog();
  const publish = () => log.write(usage.snapshot());
  publish();
  const jev = parsed.runtimePolicy.policy.allowClassification
    ? createConfiguredClassifier(env, parsed.runtimePolicy.classificationTimeoutMs) : undefined;
  const classifier: Classifier | undefined = jev ? async (request, signal) => {
    const call = usage.classificationStarted(); publish();
    try {
      const result = await jev(request, signal);
      usage.classificationFinished(call, parseDecision(result).usage); publish();
      return result;
    } catch (error) { usage.classificationFinished(call); publish(); throw error; }
  } : undefined;
  try {
    await chmod(directory, 0o700);
    const socketPath = join(directory, 'relay.sock');
    const localToken = process.platform === 'win32' ? randomBytes(32).toString('hex') : undefined;
    relay = await startSmartRelay({ ...(localToken ? { localToken } : { socketPath }), command, cwd: parsed.directory, env, serverArgs: parsed.server,
      mode: parsed.mode, model: parsed.model, runtimePolicy: parsed.runtimePolicy,
      onClient: message => { if (usage.client(message)) publish(); },
      onServer: message => { if (usage.server(message)) publish(); },
      onRoute: metadata => { usage.route(metadata); publish(); },
      onThread: id => { if (/^[a-zA-Z0-9-]+$/.test(id)) threadId = id; },
      onFailure: reason => { process.stderr.write(`smart-codex: relay disconnected (${reason}); no turn is retried.\n`); },
      classifier });
    process.stderr.write(`smart-codex: ${parsed.mode} routing; effort mode ${parsed.runtimePolicy.effortMode}; baseline medium. Plain codex is unchanged.\n`);
    process.stderr.write(`Policy ${parsed.runtimePolicy.version} (${parsed.runtimePolicy.hash.slice(0, 12)}); confidence threshold ${parsed.runtimePolicy.policy.confidenceThreshold}.\n`);
    if (log.path) process.stderr.write(`Live usage in another terminal: smart-codex monitor ${log.path}\n`);
    if (parsed.mode !== 'pinned') process.stderr.write(`Jev receives user tasks and up to two earlier task excerpts${env.SMART_CODEX_CLASSIFIER === 'hosted' ? ' through your configured gateway' : ''}. Auto routing is experimental.\n`);
    return await new Promise<number>(done => {
      const child = spawn(command.file, [...command.args, ...nativeRemoteTuiArgs(parsed.tui, relay!.endpoint, parsed.model,
        localToken ? 'MODEL_RUDDER_RELAY_TOKEN' : undefined)],
        { cwd: process.cwd(), env: { ...smartCodexChildEnv(env), ...(localToken ? { MODEL_RUDDER_RELAY_TOKEN: localToken } : {}) }, stdio: 'inherit' });
      const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
      const handlers = signals.map(signal => () => { child.kill(signal); });
      signals.forEach((signal, i) => process.on(signal, handlers[i]));
      const finish = (code: number) => { signals.forEach((signal, i) => process.off(signal, handlers[i])); done(code); };
      child.once('error', () => finish(1));
      child.once('exit', (code, signal) => finish(code ?? (signal === 'SIGINT' ? 130 : 1)));
    });
  } finally {
    await relay?.close(); await rm(directory, { recursive: true, force: true });
    usage.finish(); publish();
    log.close();
    process.stderr.write(`${formatSessionUsage(usage.snapshot(), {
      emphasis: Boolean(process.stderr.isTTY && !('NO_COLOR' in env) && env.TERM !== 'dumb'),
    })}\n\n`);
    if (threadId) process.stderr.write(`  Resume      smart-codex resume ${threadId}\n`);
    if (log.path) process.stderr.write('  Details     smart-codex report\n');
    if (log.failed) process.stderr.write('  Usage log unavailable.\n');
    process.stderr.write('\n');
  }
}

if (import.meta.main) {
  try { process.exitCode = await launchSmartCodex(process.argv.slice(2)); }
  catch (error) {
    // Only messages deliberately constructed here are actionable; never print
    // subprocess, filesystem, or provider diagnostics containing user content.
    const message = error instanceof Error && [
      'Access token', 'Account status requires', 'Account status is unavailable',
      'Unsupported Codex CLI version', 'smart-codex requires', 'Configure ALLOW_', 'ChatGPT subscription', 'Invalid --routing', 'Invalid --effort-mode',
      'Model must', 'Use plain codex', 'Provider/authentication',
      'Setup accepts', 'Existing configuration must', 'Configuration directory must',
      'Could not start editor', 'Codex executable not found', 'Unable to enforce private Windows',
    ].some(prefix => error.message.startsWith(prefix)) ? error.message : 'Could not launch smart-codex; check Codex installation, options, and directory.';
    process.stderr.write(`${message}\n`); process.exitCode = 1;
  }
}
