export function clampProgress(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function stepIndexFromProgress(progress: number, totalSteps: number): number {
  if (totalSteps <= 0) return 0;
  const clamped = clampProgress(progress);
  return Math.min(totalSteps - 1, Math.floor(clamped * totalSteps));
}

export function formatCounter(value: number): string {
  return Math.round(value).toLocaleString('pt-PT');
}
