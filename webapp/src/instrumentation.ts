import {
  resolvePublicPocketbaseUrl,
  writeRuntimeConfig,
} from '@/lib/runtime-config';

/**
 * Next runs `register()` once per server process, before any route module is
 * imported. Setting the runtime config here means the module-scoped PocketBase
 * singleton in `@/lib/pocketbase` resolves the *same* URL inside the Next
 * server as the browser does after the layout's inline script runs.
 *
 * Every page in this template is `'use client'` and no server-rendered markup
 * embeds a PocketBase URL today, so nothing currently depends on that — but
 * the singleton is process-wide, and the moment a project built from this
 * template does touch PocketBase from the server the two must not disagree.
 */
export function register(): void {
  // Only the Node runtime serves HTML here; skip edge/browser passes.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const pocketbaseUrl = resolvePublicPocketbaseUrl(process.env);
  if (!pocketbaseUrl) return;

  writeRuntimeConfig({ pocketbaseUrl });
}
