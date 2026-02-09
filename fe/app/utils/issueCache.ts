// Cache utility for storing issues in browser
const CACHE_KEY_PREFIX = 'repo_issues_';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

interface CachedData {
  issues: any[];
  timestamp: number;
  total: number;
}

export function getCacheKey(owner: string, repo: string): string {
  return `${CACHE_KEY_PREFIX}${owner}_${repo}`;
}

export function getCachedIssues(owner: string, repo: string): CachedData | null {
  try {
    const key = getCacheKey(owner, repo);
    const cached = localStorage.getItem(key);

    if (!cached) return null;

    const data: CachedData = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is expired
    if (now - data.timestamp > CACHE_EXPIRY_MS) {
      localStorage.removeItem(key);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error reading cache:', error);
    return null;
  }
}

export function setCachedIssues(owner: string, repo: string, issues: any[], total: number): void {
  try {
    const key = getCacheKey(owner, repo);
    const data: CachedData = {
      issues,
      timestamp: Date.now(),
      total
    };

    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Error writing cache:', error);
    // If storage is full, clear old caches
    clearOldCaches();
  }
}

export function clearCache(owner: string, repo: string): void {
  const key = getCacheKey(owner, repo);
  localStorage.removeItem(key);
}

function clearOldCaches(): void {
  try {
    const keys = Object.keys(localStorage);
    const cacheKeys = keys.filter(k => k.startsWith(CACHE_KEY_PREFIX));

    // Sort by timestamp and remove oldest
    const caches = cacheKeys.map(key => {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        return { key, timestamp: data.timestamp || 0 };
      } catch {
        return { key, timestamp: 0 };
      }
    });

    caches.sort((a, b) => a.timestamp - b.timestamp);

    // Remove oldest half
    const toRemove = caches.slice(0, Math.ceil(caches.length / 2));
    toRemove.forEach(({ key }) => localStorage.removeItem(key));
  } catch (error) {
    console.error('Error clearing old caches:', error);
  }
}
