import { commandForEntry } from '../src/native-runtime.ts';
import { probeCodexProtocol } from '../src/codex-protocol-probe.ts';
if (process.argv.length > 3) throw new Error('Usage: native-protocol-smoke.ts [path-to-official-codex]');
try { console.log(JSON.stringify(await probeCodexProtocol(process.env, process.argv[2] ? commandForEntry(process.argv[2]) : undefined))); }
catch (error) { console.error((error as Error).message); process.exitCode = 1; }
