// Preserve live bid freshness without repeatedly reloading full inactive lots.
export function publicPollingDelay(detail: boolean, failures: number, status?: string, startTime?: number, now = Date.now()) {
  if (failures > 0) return Math.min(300_000, 30_000 * 2 ** Math.min(failures - 1, 4));
  if (!detail) return 30_000;
  if (status && ['active', 'live', 'ending_soon'].includes(status)) return 5000;
  // Check scheduled starts promptly, including a clock transition not processed yet.
  if (status === 'upcoming' && typeof startTime === 'number' && Number.isFinite(startTime) && startTime <= now + 60_000) return 5000;
  return 60_000;
}
