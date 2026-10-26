import { spawn, execFile } from 'node:child_process';
import { parseEnv, promisify } from 'node:util';
import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codexCommand } from './native-command.ts';
import { claudeCommand } from './claude-command.ts';
import { recommend, type AdvisoryProvider } from './advisory.ts';
import { classifierStatus } from './setup.ts';
import { classificationEnabled, readClassifierConfig } from './classifier.ts';
import { advisoryHookArgs } from './advisory-hook.ts';
import { isPrivatePathSync, protectPrivatePathSync } from './private-files.ts';

export function advisoryHelp(provider: AdvisoryProvider) {
  return `Usage: smart-${provider} [native ${provider} options] [PROMPT]
       smart-${provider} recommend --current-model MODEL -- "TASK"
       smart-${provider} setup [--classifier jev] [--no-open]
       smart-${provider} classifier status
       smart-${provider} doctor
       smart-${provider} report

ModelRudder is advisory. Native model, effort, tools, login and permissions stay native.
The launcher uses your ${provider} on PATH; a managed CLI installation is not required.
${provider === 'codex' ? 'Codex can show prompt-time notes through its trusted native hooks with saved Jev configuration.\n' : ''}Run recommend for a model-change note, then switch yourself with /model if useful.
Recommendations send only the supplied task to Jev with your existing consent.
They do not execute the task or read conversation history. No note means no
recommendation is available or the current model already matches.
Legacy --routing and --effort-mode options are retired; remove them.
Existing reports and native install/status/rollback remain available for recovery.
`;
}

export function canAttachAdvisoryHook(args: string[], env: NodeJS.ProcessEnv): boolean {
  const separator = args.indexOf('--');
  const options = separator < 0 ? args : args.slice(0, separator);
  // Same-layer overrides cannot be safely merged without parsing native config.
  for (let i = 0; i < options.length; i++) {
    const arg = options[i];
    if (/^--(?:disable|enable|remote)(?:=|$)/.test(arg)) return false;
    const config = arg === '-c' || arg === '--config' ? options[++i]
      : arg.startsWith('--config=') ? arg.slice(9) : arg.startsWith('-c') ? arg.slice(2) : undefined;
    if (config && /hooks/.test(config)) return false;
  }
  try { return classificationEnabled(env); } catch { return false; }
}

export function advisoryChildEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(source).filter(([key]) => {
    const name = key.toUpperCase();
    return !['TYPESAFE_API_KEY', 'ALLOW_CLASSIFICATION', 'ALLOW_JEV_CLASSIFICATION', 'ROUTER_MODE'].includes(name) &&
      !/^(SMART_CODEX_|SMART_CLAUDE_|MODEL_RUDDER_)/.test(name);
  }));
}

export function parseRecommendation(args: string[]) {
  if (args.length !== 4 || args[0] !== '--current-model' || !/^[a-zA-Z0-9][a-zA-Z0-9._:[\]-]{0,127}$/.test(args[1]) ||
      args[2] !== '--' || !args[3]?.trim() || args[3].length > 64000) {
    throw new Error('ModelRudder: Usage: recommend --current-model MODEL -- "TASK" (at most 64000 characters).');
  }
  return { currentModel: args[1], task: args[3] };
}

export async function launchAdvisory(provider: AdvisoryProvider, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  if (args[0] === 'recommend') {
    const { task, currentModel } = parseRecommendation(args.slice(1));
    const note = await recommend(provider, task, currentModel, env);
    if (note) process.stdout.write(`${note}\n`);
    return 0;
  }
  const separator = args.indexOf('--');
  if ((separator < 0 ? args : args.slice(0, separator)).some(arg => /^--(?:routing|effort-mode)(?:=|$)/.test(arg))) {
    throw new Error('Invalid --routing/--effort-mode: automatic routing is retired. Remove these options; use recommend --current-model MODEL -- "TASK" for advice. Native model and effort are unchanged.');
  }
  const command = provider === 'codex' ? await codexCommand(env, false) : await claudeCommand(env, process.platform, false);
  const childEnv = advisoryChildEnv(env);
  if (args[0] === 'doctor') {
    if (args.length !== 1) throw new Error('ModelRudder: doctor accepts no options.');
    try {
      await promisify(execFile)(command.file, [...command.args, '--version'], { env: childEnv, timeout: 10000, maxBuffer: 16384 });
      process.stdout.write(`Native ${provider} on PATH starts. Advisory mode needs no relay, bridge or managed CLI.\n`);
    } catch { process.stdout.write(`Native ${provider} on PATH could not start.\n`); return 1; }
    if (provider === 'claude' && env.SMART_CODEX_CLASSIFIER === 'hosted') {
      process.stdout.write('Claude recommendations require direct Jev; the hosted gateway uses a Codex rubric. Run setup --classifier jev.\n');
      return 1;
    }
    const status = await classifierStatus(env);
    process.stdout.write(status.text);
    return status.ok ? 0 : 1;
  }
  let directory: string | undefined;
  let hookArgs: string[] = [];
  let hookFallback = `Use smart-${provider} recommend for a model-change note.`;
  if (provider === 'codex' && canAttachAdvisoryHook(args, env)) {
    const config = resolve(env.SMART_CODEX_ENV_FILE || fileURLToPath(new URL('../.env.local', import.meta.url)));
    if (isPrivatePathSync(config)) {
      try {
        if ((await lstat(config)).size > 64000) throw new Error('Oversized configuration');
        const saved = parseEnv(await readFile(config, 'utf8'));
        // Never silently send tasks using a different saved account or destination.
        if (!classificationEnabled(saved) || JSON.stringify(readClassifierConfig(saved)) !== JSON.stringify(readClassifierConfig(env))) {
          hookFallback = `Automatic notes skipped: effective classifier settings differ from saved configuration. ${hookFallback}`;
        } else {
          directory = await mkdtemp(join(tmpdir(), 'modelrudder-advisory-'));
          protectPrivatePathSync(directory, true);
          childEnv.MODEL_RUDDER_ADVISORY_ENV_FILE = config;
          childEnv.MODEL_RUDDER_ADVISORY_STATE_DIR = directory;
          // An existing daemon cannot inherit this launcher's private hook paths.
          const options = args.includes('--') ? args.slice(0, args.indexOf('--')) : args;
          hookArgs = [...advisoryHookArgs(), ...(options.includes('--no-daemon') ? [] : ['--no-daemon'])];
        }
      } catch {
        if (directory) await rm(directory, { recursive: true, force: true });
        directory = undefined;
      }
    }
  }
  process.stderr.write(`ModelRudder is advisory; native ${provider} controls model selection. ${hookArgs.length
    ? 'Prompt notes require native hook support and trust. Only this prompt is sent to Jev; checks wait at most 1.5 seconds.'
    : hookFallback}\n`);
  try { return await new Promise<number>(done => {
    const child = spawn(command.file, [...command.args, ...hookArgs, ...args], { env: childEnv, stdio: 'inherit', shell: false });
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
    const handlers = signals.map(signal => () => { child.kill(signal); });
    signals.forEach((signal, index) => process.on(signal, handlers[index]));
    let finished = false;
    const finish = (code: number) => {
      if (finished) return;
      finished = true;
      signals.forEach((signal, index) => process.off(signal, handlers[index]));
      done(code);
    };
    child.once('error', () => { process.stderr.write(`ModelRudder: could not start ${provider} on PATH.\n`); finish(1); });
    child.once('exit', (code, signal) => finish(code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1)));
  }); } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
