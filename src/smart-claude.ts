import { advisoryHelp, launchAdvisory } from './advisory-launcher.ts';
import { probeClaudeProtocol } from './claude-protocol-probe.ts';
import { classifierOverride } from './classifier.ts';
import { execFile } from 'node:child_process';
import { claudeChildEnv, claudeCompatibility, hasNativeClaudeLogin, validateClaudeAuthEnvironment } from './claude-command.ts';
import { claudeModels, defaultClaudeModelIds } from './claude-routing.ts';
import type { ClaudeModel, ClaudeRoutingMode } from './claude-routing.ts';
import { createClaudeClassifier } from './claude-classifier.ts';
import { claudeUsageDirectory, runClaudeReport } from './claude-usage.ts';
import { routerVersion } from './runtime-policy.ts';
import { runSetup, classifierStatus } from './setup.ts';
import { runNativeManagement } from './native-runtime.ts';
import type { NativeCommand } from './native-command.ts';

export const smartClaudeHelp = advisoryHelp('claude');

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
  run = capture, protocolProbe = probeClaudeProtocol) {
  validateClaudeAuthEnvironment(env);
  const childEnv = claudeChildEnv(env);
  let version;
  try { version = claudeCompatibility(await run(command, ['--version'], childEnv)); }
  catch { throw new Error('Claude Code could not be started; install its official CLI first.'); }
  if (!version.supportsMods) throw new Error('Claude Code requires a stable supported version; this build is blocked, too old or outside the supported major. Use plain claude.');
  try { await run(command, ['plugin', 'validate', pluginDirectory], childEnv); }
  catch { throw new Error('Claude rejected the bundled routing plugin. Use plain claude and check native plugin/policy compatibility.'); }
  if (!version.offlineTested) {
    try {
      const evidence = await protocolProbe(command);
      if (evidence.version !== `${version.version} (Claude Code)`) throw new Error('Version changed');
    } catch { throw new Error('Claude native protocol probe failed; use plain claude or the last recorded build.'); }
  }
  let status;
  try { status = await run(command, ['auth', 'status'], childEnv); }
  catch { throw new Error('Claude native login is required; run claude auth login yourself.'); }
  if (!hasNativeClaudeLogin(status)) throw new Error('Claude subscription routing requires native claude.ai login. Run claude auth status; no login or credentials were changed.');
  return version;
}

export async function launchSmartClaude(args: string[], env = process.env): Promise<number> {
  if (args[0] === 'native') return runNativeManagement('claude', args.slice(1), env);
  if (args[0] === 'setup') return runSetup(args.slice(1), env);
  ({ args, env } = classifierOverride(args, env));
  if (args[0] === 'classifier') {
    if (args.length !== 2 || args[1] !== 'status') throw new Error('Usage: classifier status');
    const status = await classifierStatus(env); process.stdout.write(status.text);
    try { createClaudeClassifier(env); }
    catch { process.stdout.write('Claude requires enabled direct Jev; hosted gateway is unsupported. Run setup --classifier jev.\n'); return 1; }
    return status.ok ? 0 : 1;
  }
  if (args[0] === 'report') return runClaudeReport(args.slice(1), claudeUsageDirectory(env));
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { process.stdout.write(smartClaudeHelp); return 0; }
  if (args.length === 1 && ['--version', '-V'].includes(args[0])) { process.stdout.write(`smart-claude ${routerVersion}\n`); return 0; }
  return launchAdvisory('claude', args, env);
}

if (import.meta.main) {
  try { process.exitCode = await launchSmartClaude(process.argv.slice(2)); }
  catch (error) {
    const message = error instanceof Error && /^(ModelRudder:|Invalid --routing|ModelRudder native:|Claude |Invalid Claude |Unsupported Claude |Use plain claude |smart-claude requires |Configure ALLOW_|Setup |Existing configuration|Configuration directory|Could not start editor|Invalid --classifier|Usage: classifier)/.test(error.message)
      ? error.message : 'Could not launch smart-claude; check native Claude installation, login, options and routing-provider setup.';
    process.stderr.write(`${message}\n`); process.exitCode = 1;
  }
}
