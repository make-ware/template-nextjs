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
  url: string = 'http://localhost:8090',
  options: PocketBaseClientOptions = {}
): TypedPocketBase {
  const pb = new PocketBase(url) as TypedPocketBase;

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
const pb = createPocketBaseClient(resolveUrl(), {
  enableAutoCancellation: false,
  requestTimeout: 30000, // 30 second timeout
});

/**
 * Re-point the singleton at the currently resolvable URL.
 *
 * The URL above is fixed at module load. Next emits its bundle chunks as
 * `<script async>` and React hoists them ABOVE anything the root layout emits,
 * so a chunk can execute — and construct this singleton — before the layout's
 * inline runtime-config script has run. Ordering therefore cannot be the
 * guarantee; this reconciliation is. `AuthProvider` calls it once, above every
 * consumer, and the invariant that makes that sufficient is:
 *
 *   **Nothing may touch `pb` at module scope.** Every importer must use it
 *   inside a render, effect, or callback. As long as that holds, no request can
 *   have gone out on the stale URL by the time this runs.
 *
 * Idempotent, and a no-op when nothing is configured: `resolveUrl()` then
 * returns exactly what the constructor was given.
 */
export function syncBaseUrl(): void {
  const url = resolveUrl();
  if (pb.baseURL !== url) pb.baseURL = url;
}

// Export the client instance
export default pb;
