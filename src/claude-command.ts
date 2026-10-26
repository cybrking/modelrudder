import { cliCompatibilityData } from './cli-compatibility-data.ts';
import { cliCompatibility } from './cli-compatibility.ts';
import { managedNativeCommand } from './native-runtime.ts';
import { stat } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import type { NativeCommand } from './native-command.ts';

// Invoke the native program without a shell; never evaluate an npm .cmd shim.
export async function claudeCommand(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform, useManaged = true): Promise<NativeCommand> {
  const managed = useManaged ? await managedNativeCommand('claude', env) : undefined;
  if (managed) return managed;
  if (platform !== 'win32') return { file: 'claude', args: [] };
  const path = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  for (const directory of path.split(delimiter).filter(Boolean)) {
    for (const executable of [join(directory, 'claude.exe'), join(directory, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')]) {
      if (await stat(executable).then(info => info.isFile(), () => false)) return { file: executable, args: [] };
    }
    const entry = join(directory, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    if (await stat(entry).then(info => info.isFile(), () => false)) return { file: process.execPath, args: ['--', entry] };
  }
  throw new Error('Claude Code executable not found; install the official CLI and add it to PATH.');
}

export const offlineTestedClaudeVersions = cliCompatibilityData.claude.tested;
export function claudeCompatibility(text: string) {
  const version = /^(\d+\.\d+\.\d+) \(Claude Code\)\s*$/.exec(text.trim())?.[1] ?? null;
  const policy = cliCompatibility('claude', version);
  return { ...policy, supportsMods: policy.eligible, offlineTested: policy.recorded };
}

export function claudeChildEnv(source: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    const name = platform === 'win32' ? key.toUpperCase() : key;
    if (name === 'TYPESAFE_API_KEY' || name === 'ALLOW_CLASSIFICATION' || name === 'ALLOW_JEV_CLASSIFICATION' || name === 'ROUTER_MODE' ||
        name.startsWith('SMART_CODEX_') || name.startsWith('SMART_CLAUDE_') || name.startsWith('MODEL_RUDDER_') ||
        ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'].includes(name)) delete env[key];
  }
  return { ...env, DISABLE_AUTOUPDATER: '1', DISABLE_UPDATES: '1' };
}

export function validateClaudeAuthEnvironment(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform) {
  const conflicting = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN',
    'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'ANTHROPIC_CUSTOM_HEADERS'];
  if (Object.entries(env).some(([key, value]) => Boolean(value) && conflicting.includes(platform === 'win32' ? key.toUpperCase() : key))) {
    throw new Error('Claude subscription routing requires native claude.ai login without API-key, token or alternate-provider environment overrides. Use a clean native-login shell; no credentials were changed.');
  }
}

export function hasNativeClaudeLogin(text: string) {
  try { const value = JSON.parse(text); return value !== null && typeof value === 'object' && value.authMethod === 'claude.ai' && value.loggedIn !== false; }
  catch { return false; }
}
