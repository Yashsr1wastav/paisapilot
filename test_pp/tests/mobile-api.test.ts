import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => secureStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { secureStore.set(key, value); },
  deleteItemAsync: async (key: string) => { secureStore.delete(key); }
}));

import { api, deleteAccount, getToken, saveToken } from '../mobile/src/api.js';

describe('mobile API session boundary', () => {
  beforeEach(() => { secureStore.clear(); vi.restoreAllMocks(); });

  it('clears a stale token after an authenticated request returns 401', async () => {
    await saveToken('stale-token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Authentication required' } }), { status: 401 }));

    await expect(api('/v1/settings')).rejects.toMatchObject({ status: 401 });
    await expect(getToken()).resolves.toBeNull();
  });

  it('uses the authenticated privacy endpoint for account deletion', async () => {
    await saveToken('current-token');
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ deleted: true }), { status: 200 }));

    await expect(deleteAccount()).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith('http://10.0.2.2:3000/v1/privacy/delete', expect.objectContaining({ method: 'DELETE', headers: expect.objectContaining({ authorization: 'Bearer current-token' }) }));
  });
});
