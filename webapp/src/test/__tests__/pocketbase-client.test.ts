import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { RUNTIME_CONFIG_KEY } from '@/lib/runtime-config';

type Host = typeof globalThis & { [RUNTIME_CONFIG_KEY]?: unknown };

/**
 * The PocketBase client is a module-scoped singleton, so each case needs a
 * fresh one — hence `vi.resetModules()` before the dynamic `import()`.
 * Whether the runtime config is set before or after that import is exactly
 * what the lazy-resolution cases below exercise.
 */
async function loadClient() {
  vi.resetModules();
  return import('@/lib/pocketbase');
}

beforeEach(() => {
  delete (globalThis as Host)[RUNTIME_CONFIG_KEY];
});

// Unstub here rather than at the end of a test body: an assertion that throws
// would otherwise leave NEXT_PUBLIC_POCKETBASE_URL stubbed for every later test.
afterEach(() => {
  vi.unstubAllEnvs();
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
  });
});

describe('lazy base URL resolution', () => {
  it('retargets a singleton constructed before the config landed', async () => {
    // The real race: a bundle chunk imports the module (and constructs `pb`)
    // before the layout's inline script has run. Nothing reconciles the
    // singleton afterwards, so `baseURL` has to resolve on read.
    const { default: pb } = await loadClient();
    expect(pb.baseURL).toBe(process.env.NEXT_PUBLIC_POCKETBASE_URL);

    (globalThis as Host)[RUNTIME_CONFIG_KEY] = {
      pocketbaseUrl: 'https://pb.example.com',
    };

    expect(pb.baseURL).toBe('https://pb.example.com');
    expect(pb.buildURL('/api/health')).toBe(
      'https://pb.example.com/api/health'
    );
  });

  it('keeps returning the build-time value when nothing is configured', async () => {
    const { default: pb } = await loadClient();

    expect(pb.baseURL).toBe(process.env.NEXT_PUBLIC_POCKETBASE_URL);
    expect(pb.baseURL).toBe(process.env.NEXT_PUBLIC_POCKETBASE_URL);
  });

  it('lets an explicit assignment win over the runtime config', async () => {
    // `baseURL` is a writable field in the SDK's public contract, and the
    // deprecated `baseUrl` alias delegates to it — neither may silently no-op.
    const { default: pb } = await loadClient();

    pb.baseURL = 'https://manual.example.com';
    (globalThis as Host)[RUNTIME_CONFIG_KEY] = {
      pocketbaseUrl: 'https://pb.example.com',
    };

    expect(pb.baseURL).toBe('https://manual.example.com');
  });
});
