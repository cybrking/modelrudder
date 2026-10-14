import { cliCompatibilityData } from './cli-compatibility-data.ts';
import { cliCompatibility } from './cli-compatibility.ts';
export const protocolTestedCodexVersions = cliCompatibilityData.codex.tested;
export function codexCompatibility(output: string) {
  const version = output.trim().match(/^codex-cli (\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/)?.[1] ?? null;
  const policy = cliCompatibility('codex', version);
  return { ...policy, protocolTested: policy.recorded,
    nativeTuiCertified: false as const };
}

// Qualification changes require independently reviewed model/effort outcomes.
// Existing explicit experimental routing remains available.
export const routingQualification = Object.freeze({ revision: 'outcome-gates-v1',
  status: 'experimental' as const, taskQualityVerified: false, confidenceCalibrated: false,
  customerBaseline: 'observe' as const, evidence: 'docs/RELIABILITY_EXPERIMENT.md' });
