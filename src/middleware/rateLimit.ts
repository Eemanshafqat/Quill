const writes = new Map<string, number[]>();

const WINDOW_MS = 60_000;
const MAX_WRITES = 30;

export function checkWriteRateLimit(userId: string): boolean {
  const now = Date.now();
  const recent = (writes.get(userId) ?? []).filter(
    (time) => now - time < WINDOW_MS
  );

  if (recent.length >= MAX_WRITES) {
    writes.set(userId, recent);
    return false;
  }

  recent.push(now);
  writes.set(userId, recent);

  return true;
}
