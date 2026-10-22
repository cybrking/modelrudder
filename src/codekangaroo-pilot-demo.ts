// Unwired synthetic fixture for an advisory review demonstration.
export function formatWaitingMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder}m`;
}
