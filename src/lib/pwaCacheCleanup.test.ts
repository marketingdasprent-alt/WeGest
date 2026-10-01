import { describe, expect, it, vi } from 'vitest';

import { LEGACY_AUTH_CACHE, removeLegacyAuthenticatedCache } from '@/lib/pwaCacheCleanup';

describe('removeLegacyAuthenticatedCache', () => {
  it('apaga o cache Supabase criado pelo service worker antigo', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);

    await removeLegacyAuthenticatedCache({ delete: deleteCache });

    expect(deleteCache).toHaveBeenCalledWith(LEGACY_AUTH_CACHE);
  });
});
