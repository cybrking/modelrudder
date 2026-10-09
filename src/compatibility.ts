// Exact builds with recorded protocol evidence; this is not a semver promise.
export const protocolTestedCodexVersions = ['0.159.3', '0.160.1', '0.161.0'] as const;
export function codexCompatibility(output: string) {
  const version = output.trim().match(/^codex-cli (\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/)?.[1] ?? null;
  return { version, protocolTested: version !== null && protocolTestedCodexVersions.some(v => v === version),
    nativeTuiCertified: false as const };
}

// Qualification changes require independently reviewed model/effort outcomes.
// Existing explicit experimental routing remains available.
export const routingQualification = Object.freeze({ revision: 'outcome-gates-v1',
  status: 'experimental' as const, taskQualityVerified: false, confidenceCalibrated: false,
  customerBaseline: 'observe' as const, evidence: 'docs/RELIABILITY_EXPERIMENT.md' });
