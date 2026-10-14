import { commandForEntry } from '../src/native-runtime.ts';
import { claudeCommand } from '../src/claude-command.ts';
import { probeClaudeProtocol } from '../src/claude-protocol-probe.ts';
if (process.argv.length > 3) throw new Error('Usage: claude-native-smoke.ts [path-to-official-claude]');
const command = process.argv[2] ? commandForEntry(process.argv[2]) : await claudeCommand();
console.log(JSON.stringify(await probeClaudeProtocol(command), null, 2));
