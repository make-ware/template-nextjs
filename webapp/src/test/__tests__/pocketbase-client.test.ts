import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RUNTIME_CONFIG_KEY } from '@/lib/runtime-config';

type Host = typeof globalThis & { [RUNTIME_CONFIG_KEY]?: unknown };

/**
 * The PocketBase client is a module-scoped singleton constructed at import
 * time, so the runtime config has to be on `globalThis` *before* the dynamic
 * `import()` — hence `vi.resetModules()` between cases. Skipping these would
 * leave the actual fix untested; this module is the fix.
 */
async function loadClient() {
  vi.resetModules();
  return import('@/lib/pocketbase');
}

beforeEach(() => {
  delete (globalThis as Host)[RUNTIME_CONFIG_KEY];
});

describe('pocketbase resolveUrl', () => {
  it('prefers the runtime config over the build-time var', async () => {
    (globalThis as Host)[RUNTIME_CONFIG_KEY] = {
      pocketbaseUrl: 'https://pb.example.com',
    };

    const { default: pb, resolveUrl } = await loadClient();

    expect(resolveUrl()).toBe('https://pb.example.com');
    expect(pb.baseURL).toBe('https://pb.example.com');
  });

  it('passes a relative runtime config straight through to the SDK', async () => {
    // PocketBase's own buildURL resolves a non-http base against
    // window.location.origin, so `/` must survive unrewritten.
    (globalThis as Host)[RUNTIME_CONFIG_KEY] = { pocketbaseUrl: '/' };

    const { default: pb, resolveUrl } = await loadClient();

    expect(resolveUrl()).toBe('/');
    expect(pb.baseURL).toBe('/');
    expect(pb.buildURL('/api/health')).toBe(
      `${window.location.origin}/api/health`
    );
  });

  it('falls back to the build-time var when no runtime config is set', async () => {
    // Backward-compat gate: unconfigured deployments must behave exactly as
    // they did before the runtime tier existed.
    expect((globalThis as Host)[RUNTIME_CONFIG_KEY]).toBeUndefined();

    const { default: pb, resolveUrl } = await loadClient();

    expect(resolveUrl()).toBe(process.env.NEXT_PUBLIC_POCKETBASE_URL);
    expect(pb.baseURL).toBe(process.env.NEXT_PUBLIC_POCKETBASE_URL);
  });

  it('ignores a malformed runtime config and falls back', async () => {
    (globalThis as Host)[RUNTIME_CONFIG_KEY] = { pocketbaseUrl: 42 };

    const { resolveUrl } = await loadClient();

    expect(resolveUrl()).toBe(process.env.NEXT_PUBLIC_POCKETBASE_URL);
  });

  it('falls back to the local-dev default when nothing at all is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_POCKETBASE_URL', '');

    const { resolveUrl } = await loadClient();

    expect(resolveUrl()).toBe('http://localhost:8090');

    vi.unstubAllEnvs();
  });
});

describe('syncBaseUrl', () => {
  it('re-points a singleton constructed before the config landed', async () => {
    // The real race: a bundle chunk imports the module (and constructs `pb`)
    // before the layout's inline script has run.
    const { default: pb, syncBaseUrl } = await loadClient();
    expect(pb.baseURL).toBe(process.env.NEXT_PUBLIC_POCKETBASE_URL);

    (globalThis as Host)[RUNTIME_CONFIG_KEY] = {
      pocketbaseUrl: 'https://pb.example.com',
    };
    syncBaseUrl();

    expect(pb.baseURL).toBe('https://pb.example.com');
  });

  it('is a no-op when nothing is configured', async () => {
    const { default: pb, syncBaseUrl } = await loadClient();
    const before = pb.baseURL;

    syncBaseUrl();
    syncBaseUrl();

    expect(pb.baseURL).toBe(before);
  });
});
