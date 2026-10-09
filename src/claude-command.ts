import { stat } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import type { NativeCommand } from './native-command.ts';

// Invoke the native program without a shell; never evaluate an npm .cmd shim.
export async function claudeCommand(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): Promise<NativeCommand> {
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

// Mods launched in 2.1.287. Newer minors/majors are deliberately not assumed
// compatible. Default Haiku 5.5 also needs 2.1.293+. Only 2.1.295 has this
// change's recorded offline module and synthetic provider-wire evidence.
export const offlineTestedClaudeVersions = ['2.1.295'] as const;
export function claudeCompatibility(text: string) {
  const match = /^(2\.1\.(\d+)) \(Claude Code\)\s*$/.exec(text.trim());
  return { version: match?.[1], supportsMods: Boolean(match && Number(match[2]) >= 293),
    offlineTested: offlineTestedClaudeVersions.some(version => version === match?.[1]) };
}

export function claudeChildEnv(source: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    const name = platform === 'win32' ? key.toUpperCase() : key;
    if (name === 'TYPESAFE_API_KEY' || name === 'ALLOW_JEV_CLASSIFICATION' || name === 'ROUTER_MODE' ||
        name.startsWith('SMART_CODEX_') || name.startsWith('SMART_CLAUDE_') || name.startsWith('MODEL_RUDDER_') ||
        ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'].includes(name)) delete env[key];
  }
  return env;
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
