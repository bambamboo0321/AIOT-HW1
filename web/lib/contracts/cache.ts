/**
 * Cache Policy Contracts (Deferred to M8+)
 *
 * M7 defines types only. No in-memory global Maps, Redis, or databases are introduced.
 * Serverless execution environments cannot rely on process memory as a shared cache.
 */

export interface CacheEntry<T> {
  data: T;
  cachedAt: string; // ISO 8601 string
  expiresAt: string; // ISO 8601 string
}

export interface CachePolicy {
  ttlSeconds: number;
  staleWhileRevalidateSeconds?: number;
}
