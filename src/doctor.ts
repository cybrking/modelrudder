import { codexCompatibility, protocolTestedCodexVersions, routingQualification } from './compatibility.ts';
import { execFile } from 'node:child_process';
import { readLiveConfig } from './live-config.ts';
import { readClassifierConfig } from './classifier.ts';
import { createRuntimePolicy, routerVersion } from './runtime-policy.ts';
import type { RuntimePolicy } from './runtime-policy.ts';
import { codexCommand } from './native-command.ts';

type Probe = (args: string[]) => Promise<{ stdout: string; stderr: string }>;

export function doctorChildEnv(source: Record<string, string | undefined>) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (/(?:API_?KEY|TOKEN|SECRET|PASSWORD)$/i.test(key) ||
      ['OPENAI_BASE_URL', 'OPENAI_ORG_ID', 'OPENAI_PROJECT_ID'].includes(key)) delete env[key];
  }
  return env;
}

const probeCodex: Probe = async args => {
  const env = doctorChildEnv(process.env);
  const command = await codexCommand(env);
  return new Promise((resolve, reject) => execFile(command.file, [...command.args, ...args], { env, timeout: 10_000, maxBuffer: 64 * 1024 }, (error, stdout, stderr) => {
    if (error) reject(new Error('Codex diagnostic failed'));
    else resolve({ stdout, stderr });
  }));
};

export async function runDoctor(env: Record<string, string | undefined>, probe: Probe = probeCodex,
  runtimePolicy: RuntimePolicy = createRuntimePolicy()) {
  const effective = createRuntimePolicy(runtimePolicy);
  const lines = [`Router: smart-codex ${routerVersion}`, `Node: ${process.versions.node}`,
    'Text commands: observe (DEEP baseline); ROUTER_MODE applies only to text commands.',
    `Interactive routing: ${effective.mode} (${effective.mode === 'auto' ? 'experimental; default unless --routing or --model overrides it' : 'explicit option'}); effort ${effective.effort}`,
    `Policy: ${effective.version}; SHA-256 ${effective.hash}`,
    `Context eligibility: ${effective.contextEligibility}; native references, media, resumed/forked and unobserved histories use the medium baseline unless pinned.`,
    `Interactive effort mode: ${effective.effortMode}; baseline medium; FAST Luna proposal low, other profiles medium. Model observe, pinned and fallback use medium.`,
    `Fallback: ${effective.routes[effective.policy.fallback].model}; threshold ${effective.policy.confidenceThreshold} (uncalibrated); Jev timeout ${effective.classificationTimeoutMs} ms`];
  let ok = Number(process.versions.node.split('.')[0]) >= 24;
  lines.push(`TypeSafe credential: ${env.TYPESAFE_API_KEY?.trim() ? 'present' : 'missing'}`);
  try {
    const config = readLiveConfig(env);
    lines.push(`Text Jev classification: ${config.allowClassification ? 'enabled' : 'disabled'}`);
  } catch (error) {
    lines.push(`Configuration: ${(error as Error).message}`);
  }
  let interactiveReady = !effective.policy.allowClassification;
  if (effective.policy.allowClassification && env.ALLOW_JEV_CLASSIFICATION === 'true') {
    try { readClassifierConfig(env); interactiveReady = true; } catch { /* Report readiness below without credentials. */ }
  }
  lines.push(`Classifier transport: ${env.SMART_CODEX_CLASSIFIER === 'hosted' ? 'hosted gateway; endpoint and customer token withheld' : 'direct Jev'}`);
  lines.push(`Interactive Jev classification: ${!effective.policy.allowClassification ? 'disabled; no credentials required' : interactiveReady ? 'configured' : 'requires ALLOW_JEV_CLASSIFICATION=true and TYPESAFE_API_KEY or hosted gateway credentials; alternatively use --routing pinned'}`);
  ok &&= interactiveReady;
  try {
    const version = await probe(['--version']);
    const compatibility = codexCompatibility(version.stdout);
    lines.push(`Codex CLI: ${compatibility.version ?? 'unrecognized'}; protocol evidence ${compatibility.protocolTested ? 'recorded' : 'missing'}`);
    ok &&= compatibility.protocolTested;
    const status = await probe(['login', 'status']);
    const loggedIn = `${status.stdout}\n${status.stderr}`.includes('Logged in using ChatGPT');
    lines.push(`Codex subscription login: ${loggedIn ? 'ready' : 'required; run codex login'}`);
    ok &&= loggedIn;
    const help = await probe(['--help']);
    const serverHelp = await probe(['app-server', '--help']);
    const remote = /(?:^|\s)--remote(?:\s|[=<])/.test(help.stdout);
    const stdio = /(?:^|\s)--stdio(?:\s|$)/.test(serverHelp.stdout);
    lines.push(`Codex advertised capabilities: --remote ${remote ? 'present' : 'missing'}; app-server --stdio ${stdio ? 'present' : 'missing'}`);
    ok &&= remote && stdio;
  } catch {
    lines.push('Codex diagnostic probe failed; check installation, login and CLI capabilities. Run codex login if needed.');
    ok = false;
  }
  lines.push(`Compatibility: exact protocol-tested builds ${protocolTestedCodexVersions.join(', ')}; native TUI release certification remains pending.`);
  lines.push(`Automatic routing qualification: ${routingQualification.status}; task quality and confidence calibration remain unverified. Customer onboarding baseline: observe.`);
  lines.push('Diagnostics do not call Jev or execute a model; account model access and native TUI behavior remain unverified.');
  return { ok, text: `${lines.join('\n')}\n` };
}

if (import.meta.main) {
  const result = await runDoctor(process.env);
  process.stdout.write(result.text);
  process.exitCode = result.ok ? 0 : 1;
}
