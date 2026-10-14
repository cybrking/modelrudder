import { managedNativeCommand } from './native-runtime.ts';
import { stat } from 'node:fs/promises';
import { join, delimiter } from 'node:path';

export type NativeCommand = { file: string; args: string[] };

// Node cannot exec a Windows npm .cmd shim without a shell. Invoke its JS
// entry point with Node instead, preserving argument boundaries and approvals.
export async function codexCommand(env: NodeJS.ProcessEnv = process.env): Promise<NativeCommand> {
  const managed = await managedNativeCommand('codex', env);
  if (managed) return managed;
  if (process.platform !== 'win32') return { file: 'codex', args: [] };
  const path = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  for (const directory of path.split(delimiter).filter(Boolean)) {
    const executable = join(directory, 'codex.exe');
    if (await stat(executable).then(info => info.isFile(), () => false)) return { file: executable, args: [] };
    const entry = join(directory, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (await stat(entry).then(info => info.isFile(), () => false)) return { file: process.execPath, args: ['--', entry] };
  }
  throw new Error('Codex executable not found; install Codex and add it to PATH.');
}

export function nativeDiagnosticEnv(source: Record<string, string | undefined>) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (/(?:API_?KEY|TOKEN|SECRET|PASSWORD)$/i.test(key) ||
      ['OPENAI_BASE_URL', 'OPENAI_ORG_ID', 'OPENAI_PROJECT_ID'].includes(key)) delete env[key];
  }
  return env;
}
