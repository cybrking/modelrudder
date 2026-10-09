import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { claudeCommand, claudeChildEnv, claudeCompatibility, hasNativeClaudeLogin, validateClaudeAuthEnvironment } from './claude-command.ts';
import { claudeModels, defaultClaudeModelIds, readClaudeModelIds, startClaudeBridge } from './claude-routing.ts';
import type { ClaudeModel, ClaudeRoutingMode } from './claude-routing.ts';
import { createClaudeClassifier } from './claude-classifier.ts';
import { claudeUsageDirectory, createClaudeUsage, formatClaudeUsage, runClaudeReport } from './claude-usage.ts';
import { routerVersion } from './runtime-policy.ts';
import { runSetup } from './setup.ts';
import type { NativeCommand } from './native-command.ts';

export const smartClaudeHelp = `Usage: smart-claude [--routing auto|observe|pinned] [--model haiku|sonnet|opus] [Claude options] [PROMPT]
       smart-claude doctor
       smart-claude setup [--no-open]
       smart-claude report

Runs the native interactive Claude Code CLI with ModelRudder's local Mods adapter.
auto (default): one experimental Jev recommendation per eligible user turn;
the requested model is held throughout that turn's tool loop.
observe: get recommendations while starting on Sonnet; native choices remain native.
pinned: no Jev calls; start on --model (default sonnet).
An explicit --model selects pinned mode unless --routing is also supplied.
Claude Code retains tools, streaming, login, approvals and workspace permissions.
Subagents/helpers remain native. Unknown, resumed or media context is conservative.
Model aliases: FAST=Haiku; BALANCED/DEEP=Sonnet; MAX=Opus. Effort stays native.
Requires Node 24+, Claude Code 2.1.293+ (2.1.x), native claude.ai login,
and direct Jev configuration for auto/observe. No subscription limit is bypassed.
Supported native options: --continue/-c, --resume/-r ID, --fork-session,
--add-dir DIR (repeatable), --permission-mode manual|plan|acceptEdits,
--effort low|medium|high|xhigh|max, --verbose.
Use plain claude for other commands/options. Plain claude is unchanged.
Shared Jev config uses SMART_CODEX_ENV_FILE; no Claude credentials are read/copied.
`;

export function parseSmartClaudeArgs(args: string[]) {
  let mode: ClaudeRoutingMode = 'auto', model: ClaudeModel = 'sonnet';
  let explicitMode = false, explicitModel = false;
  let prompt: string | undefined;
  const native: string[] = [];
  const flags = new Set(['--continue', '-c', '--fork-session', '--verbose']);
  const values = new Set(['--resume', '-r', '--add-dir', '--permission-mode', '--effort']);
  for (let i = 0; i < args.length; i++) {
    const raw = args[i];
    if (raw === '--') {
      if (prompt !== undefined || args.length !== i + 2) throw new Error('Claude launcher accepts one quoted initial prompt.');
      prompt = args[i + 1]; break;
    }
    const equal = raw.indexOf('=');
    const name = equal > 0 ? raw.slice(0, equal) : raw;
    if (name === '--routing' || name === '--model' || name === '-m' || values.has(name)) {
      const value = equal > 0 ? raw.slice(equal + 1) : args[++i];
      if (!value || value.startsWith('-')) throw new Error('Claude option requires a nonempty value.');
      if (name === '--routing') {
        if (explicitMode || !['auto', 'observe', 'pinned'].includes(value)) throw new Error('Invalid Claude --routing; use auto, observe or pinned once.');
        mode = value as ClaudeRoutingMode; explicitMode = true;
      } else if (name === '--model' || name === '-m') {
        if (explicitModel || !claudeModels.includes(value as ClaudeModel)) throw new Error('Invalid Claude --model; use haiku, sonnet or opus once.');
        model = value as ClaudeModel; explicitModel = true;
      } else {
        if (name === '--permission-mode' && !['manual', 'plan', 'acceptEdits'].includes(value)) throw new Error('Claude launcher accepts manual, plan or acceptEdits permission mode; omit to preserve native settings.');
        if (name === '--effort' && !['low', 'medium', 'high', 'xhigh', 'max'].includes(value)) throw new Error('Invalid Claude effort value.');
        native.push(name, value);
      }
    } else if (flags.has(raw)) native.push(raw);
    else if (raw.startsWith('-')) throw new Error('Unsupported Claude option; use smart-claude --help or plain claude.');
    else {
      if (prompt !== undefined) throw new Error('Claude launcher accepts one quoted initial prompt.');
      if (['auth', 'login', 'logout', 'plugin', 'plugins', 'mcp', 'update', 'doctor', 'install', 'setup-token', 'help'].includes(raw)) throw new Error('Use plain claude for account, install and management commands.');
      prompt = raw;
    }
  }
  if (prompt !== undefined && (!prompt.trim() || prompt.startsWith('-') || prompt.length > 100_000)) throw new Error('Claude initial prompt must be nonempty, at most 100000 characters, and not begin with a dash.');
  if (explicitModel && !explicitMode) mode = 'pinned';
  if (explicitModel && mode !== 'pinned') throw new Error('Claude --model requires pinned routing; auto/observe use a Sonnet baseline.');
  return { mode, model, native, prompt };
}

export function nativeClaudeArgs(parsed: ReturnType<typeof parseSmartClaudeArgs>, pluginDirectory: string,
  modelIds: Readonly<Record<ClaudeModel, string>> = defaultClaudeModelIds) {
  const resumed = parsed.native.some(arg => ['--resume', '-r', '--continue', '-c'].includes(arg));
  const modelArgs = resumed && parsed.mode !== 'pinned' ? [] : ['--model', modelIds[parsed.mode === 'pinned' ? parsed.model : 'sonnet']];
  return [...parsed.native, ...modelArgs, '--plugin-dir', pluginDirectory,
    ...(parsed.prompt === undefined ? [] : [parsed.prompt])];
}

function capture(command: NativeCommand, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((done, reject) => {
    execFile(command.file, [...command.args, ...args], { env, timeout: 15_000, maxBuffer: 256 * 1024, windowsHide: true },
      (error, stdout) => error ? reject(new Error('Claude native check failed.')) : done(stdout));
  });
}

export async function checkClaudeNative(command: NativeCommand, env: NodeJS.ProcessEnv, pluginDirectory: string,
  run = capture) {
  validateClaudeAuthEnvironment(env);
  const childEnv = claudeChildEnv(env);
  let version;
  try { version = claudeCompatibility(await run(command, ['--version'], childEnv)); }
  catch { throw new Error('Claude Code could not be started; install its official CLI first.'); }
  if (!version.supportsMods) throw new Error('Claude Code 2.1.293 or newer within 2.1.x is required for native Mods routing with these models.');
  try { await run(command, ['plugin', 'validate', pluginDirectory], childEnv); }
  catch { throw new Error('Claude rejected the bundled routing plugin. Use plain claude and check native plugin/policy compatibility.'); }
  let status;
  try { status = await run(command, ['auth', 'status'], childEnv); }
  catch { throw new Error('Claude native login is required; run claude auth login yourself.'); }
  if (!hasNativeClaudeLogin(status)) throw new Error('Claude subscription routing requires native claude.ai login. Run claude auth status; no login or credentials were changed.');
  return version;
}

export async function launchSmartClaude(args: string[], env = process.env): Promise<number> {
  if (args[0] === 'setup') return runSetup(args.slice(1), env);
  if (args[0] === 'report') return runClaudeReport(args.slice(1), claudeUsageDirectory(env));
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { process.stdout.write(smartClaudeHelp); return 0; }
  if (args.length === 1 && ['--version', '-V'].includes(args[0])) { process.stdout.write(`smart-claude ${routerVersion}\n`); return 0; }
  const doctor = args[0] === 'doctor';
  if (doctor && args.length !== 1) throw new Error('Claude doctor accepts no options.');
  const parsed = parseSmartClaudeArgs(doctor ? [] : args);
  const modelIds = readClaudeModelIds(env);
  const pluginDirectory = fileURLToPath(new URL('../plugins/claude', import.meta.url));
  if (!doctor && (!process.stdin.isTTY || !process.stdout.isTTY)) throw new Error('smart-claude requires an interactive terminal; print/SDK routing is not supported.');
  const command = await claudeCommand(claudeChildEnv(env));
  const version = await checkClaudeNative(command, env, pluginDirectory);
  if (doctor) {
    process.stdout.write(`Claude ${version.version}: native login and plugin validation passed. No model call was submitted.\n`);
    try { createClaudeClassifier(env); process.stdout.write('Direct Jev configuration present (credentials were not tested remotely).\n'); }
    catch { process.stdout.write('Direct Jev configuration is not ready; pinned mode remains available. Run smart-claude setup.\n'); }
    process.stdout.write(`Offline Mods fixture coverage: ${version.offlineTested ? 'this version' : '2.1.295 only; this version unqualified'}. Full live TUI and quality validation remain pending.\n`);
    return 0;
  }
  const classifier = parsed.mode === 'pinned' ? undefined : createClaudeClassifier(env);
  const usage = createClaudeUsage(claudeUsageDirectory(env));
  const token = randomBytes(32).toString('hex');
  let ready = false;
  let bridge: Awaited<ReturnType<typeof startClaudeBridge>> | undefined;
  try {
    bridge = await startClaudeBridge({ mode: parsed.mode, model: parsed.model, modelIds, classifier, token,
      onReady() { ready = true; }, onRoute: usage.route, onComplete: usage.complete });
    process.stderr.write(`smart-claude: ${parsed.mode} per-turn routing via native Mods. Claude retains tools, approvals and login.\n`);
    if (classifier) process.stderr.write('Jev receives eligible user task text plus up to two bounded previous task excerpts. Automatic model choices are experimental.\n');
    process.stderr.write('Native effort is preserved. Model availability, provider limits and other trusted mods can affect the actual model.\n');
    if (!version.offlineTested) process.stderr.write(`Claude ${version.version} is not offline-qualified; recorded module tests used 2.1.295.\n`);
    return await new Promise<number>(done => {
      const child = spawn(command.file, [...command.args, ...nativeClaudeArgs(parsed, pluginDirectory, modelIds)], { stdio: 'inherit', shell: false,
        env: { ...claudeChildEnv(env), MODEL_RUDDER_CLAUDE_ENDPOINT: bridge!.endpoint, MODEL_RUDDER_CLAUDE_TOKEN: token,
          MODEL_RUDDER_CLAUDE_MODE: parsed.mode, MODEL_RUDDER_CLAUDE_MODEL: parsed.model,
          MODEL_RUDDER_CLAUDE_HAIKU_MODEL: modelIds.haiku, MODEL_RUDDER_CLAUDE_SONNET_MODEL: modelIds.sonnet,
          MODEL_RUDDER_CLAUDE_OPUS_MODEL: modelIds.opus } });
      const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
      const handlers = signals.map(signal => () => { child.kill(signal); });
      signals.forEach((signal, i) => process.on(signal, handlers[i]));
      let finished = false;
      const finish = (code: number) => { if (finished) return; finished = true; signals.forEach((signal, i) => process.off(signal, handlers[i])); done(code); };
      child.once('error', () => finish(1));
      child.once('exit', (code, signal) => finish(code ?? (signal === 'SIGINT' ? 130 : 1)));
    });
  } finally {
    await bridge?.close(); usage.close();
    if (!ready) process.stderr.write('smart-claude: routing plugin did not report ready; do not assume routing was active. Check Claude plugin trust and managed policy.\n');
    process.stderr.write(formatClaudeUsage(usage.snapshot()));
    if (usage.path) process.stderr.write('Latest metadata: smart-claude report\n');
  }
}

if (import.meta.main) {
  try { process.exitCode = await launchSmartClaude(process.argv.slice(2)); }
  catch (error) {
    const message = error instanceof Error && /^(Claude |Invalid Claude |Unsupported Claude |Use plain claude |smart-claude requires |Configure ALLOW_)/.test(error.message)
      ? error.message : 'Could not launch smart-claude; check native Claude installation, login, options and direct Jev configuration.';
    process.stderr.write(`${message}\n`); process.exitCode = 1;
  }
}
