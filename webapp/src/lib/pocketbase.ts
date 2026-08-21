// Create PocketBase client instance using local PocketBase package
import PocketBase from 'pocketbase';
import type { TypedPocketBase } from './types';
import { readRuntimeConfig } from './runtime-config';

/** Last-resort default, used when nothing is configured at all. */
const DEFAULT_POCKETBASE_URL = 'http://localhost:8090';

export interface PocketBaseClientOptions {
  enableAutoCancellation?: boolean;
  requestTimeout?: number;
}

/**
 * The base URL the browser uses to reach PocketBase, in priority order:
 *
 * 1. the server-injected runtime config (`PUBLIC_POCKETBASE_URL`) — the only
 *    tier an operator can change without rebuilding the image;
 * 2. `NEXT_PUBLIC_POCKETBASE_URL`, inlined by `next build` — today's behaviour,
 *    and still what applies when nothing is injected;
 * 3. the local-dev default.
 *
 * A relative value (`/`) is returned as-is on purpose: the PocketBase SDK's
 * `buildURL` already resolves a non-`http(s)` base against
 * `window.location.origin`, which is what makes the same-origin nginx
 * deployment work. Re-implementing that here would only create a way to
 * disagree with the SDK.
 */
export function resolveUrl(): string {
  return (
    readRuntimeConfig()?.pocketbaseUrl ||
    process.env.NEXT_PUBLIC_POCKETBASE_URL ||
    DEFAULT_POCKETBASE_URL
  );
}

/**
 * Create a configured PocketBase client with proper settings
 */
function createPocketBaseClient(
  resolveBaseUrl: () => string,
  options: PocketBaseClientOptions = {}
): TypedPocketBase {
  const pb = new PocketBase(resolveBaseUrl()) as TypedPocketBase;

  // Resolve the base URL on every read rather than freezing it here.
  //
  // Next emits its bundle chunks as `<script async>` and React hoists them
  // ABOVE anything the root layout emits, so this module can be evaluated —
  // and this singleton constructed — before the layout's inline
  // runtime-config script has run. Ordering therefore cannot be the guarantee.
  // The SDK reads `baseURL` inside `buildURL` on every request, so resolving
  // lazily means the first request issued after that script lands already uses
  // the right origin, with no reconciliation step for callers to remember.
  //
  // The setter keeps the SDK's public contract intact (`baseURL` is a writable
  // field, and the deprecated `baseUrl` alias delegates to it): an explicit
  // assignment wins from then on.
  let baseUrlOverride: string | undefined;
  Object.defineProperty(pb, 'baseURL', {
    get: () => baseUrlOverride ?? resolveBaseUrl(),
    set: (value: string) => {
      baseUrlOverride = value;
    },
    enumerable: true,
    configurable: true,
  });

  // Enable auto cancellation for duplicate requests
  pb.autoCancellation(options.enableAutoCancellation ?? false);

  // Add global error interceptor for better error handling
  pb.beforeSend = function (url, requestOptions) {
    // Add timeout to prevent hanging requests
    if (!requestOptions.signal && options.requestTimeout) {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), options.requestTimeout);
      requestOptions.signal = controller.signal;
    }

    return { url, options: requestOptions };
  };

  return pb;
}

// Create PocketBase client instance
const pb = createPocketBaseClient(resolveUrl, {
  enableAutoCancellation: false,
  requestTimeout: 30000, // 30 second timeout
});

// Export the client instance
export default pb;
