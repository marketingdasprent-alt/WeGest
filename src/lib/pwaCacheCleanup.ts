export const LEGACY_AUTH_CACHE = 'supabase-cache';

interface CacheStorageDelete {
  delete(cacheName: string): Promise<boolean>;
}

/** Remove respostas autenticadas deixadas por versões antigas do service worker. */
export async function removeLegacyAuthenticatedCache(
  cacheStorage: CacheStorageDelete | undefined = globalThis.caches
): Promise<void> {
  if (!cacheStorage) return;
  await cacheStorage.delete(LEGACY_AUTH_CACHE);
}
