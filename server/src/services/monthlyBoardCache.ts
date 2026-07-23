const BOARD_CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 100;

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const cache = new Map<string, CacheEntry<unknown>>();

export const monthlyBoardCacheKey = (
  month: string,
  search: string | null,
): string => `${month}:${(search || '').trim().toLocaleLowerCase()}`;

export const getCachedMonthlyBoard = <T>(key: string): T | null => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
};

export const setCachedMonthlyBoard = <T>(key: string, value: T): void => {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, {
    expiresAt: Date.now() + BOARD_CACHE_TTL_MS,
    value,
  });
};

export const clearMonthlyBoardCache = (): void => {
  cache.clear();
};
