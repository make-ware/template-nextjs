# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Yarn 4 workspaces monorepo — run everything from the repo root. Workspaces: `@template-ware/webapp` (Next.js), `@template-ware/pb` (PocketBase).

```bash
yarn init:project     # one-shot: rename this template into a new project (see below)
yarn install
yarn setup            # download the PocketBase binary (gitignored; required before `yarn dev`)
yarn dev              # Next.js :3000 + PocketBase :8090 concurrently
yarn test             # vitest run (webapp only)
yarn typecheck        # tsc --noEmit per workspace
yarn lint             # eslint --fix   (yarn lint:check for no-fix)
yarn format           # prettier --write
yarn precommit        # local fix-and-check shortcut: lint + typecheck + format + test
```

Single test file / single test name:

```bash
yarn workspace @template-ware/webapp test src/test/__tests__/login-form.test.tsx
yarn workspace @template-ware/webapp test -t "shows validation error"
yarn workspace @template-ware/webapp test:watch
```

Schema/migration scripts (see "Schema definitions vs. migrations" below). Deliberately **not** part of `precommit` — run them when you touch a schema:

```bash
yarn db:status      # diff zod schemas against the committed migrations
yarn db:verify      # which migrations the local DB actually applied (needs pb_data/data.db)
yarn db:generate    # write a migration for the pending changes
yarn db:lint        # catch JS that Node accepts but PocketBase's goja runtime rejects
yarn typegen        # generate webapp/src/types/pocketbase-types.ts from the schemas
```

PR CI (`.github/workflows/ci.yml`) runs lint, formatting, typecheck, tests, migration lint, and a production build. `.github/workflows/release.yml` handles release-please and Docker image publishing.

PocketBase alone: `yarn workspace @template-ware/pb dev` (`./pocketbase serve`). Admin UI at <http://localhost:8090/_/>; first visit creates the superuser.

### Cloning this template into a new project

`scripts/init-project.js` (`yarn init:project`) is the one-shot bootstrap for a fresh clone. It
rewrites `@template-ware/*` → the new scope and `template-ware`/`starter-ware` → the new name across
every text file, then re-sorts `yarn.lock` (renaming workspaces moves their entries out of yarn's
sort order, which would otherwise make `yarn install --immutable` — used by the Docker builds —
reject the lockfile). It also retitles the app, optionally strips the example Todos feature, seeds
`.env`, and installs the project-facing `README.md` / `CLAUDE.md`.

The files it installs live in `scripts/templates/`: `README.md`, `CLAUDE.md`, `home-page.tsx`, and
`personalized-content.test.tsx`. They use `{{PROJECT_NAME}}` / `{{PROJECT_TITLE}}` /
`{{PROJECT_DESCRIPTION}}` / `{{SCOPE}}` placeholders plus `<!-- IF_EXAMPLE -->` /
`<!-- IF_NO_EXAMPLE -->` blocks, resolved by `render()`. The landing page and its test are installed
as a pair — `personalized-content.test.tsx` asserts on the copy the landing page renders, so
changing one without the other breaks `yarn test`.

Two invariants to preserve when editing the script:

- **It must never rename itself.** It holds the old names as constants, so `renameEverywhere` skips
  `__filename` and `scripts/templates/`.
- **Fragments it edits must stay in sync with the source.** `editFile`/`dropLines` record a note
  instead of failing when an expected fragment is missing, so if you change the metadata block in
  `app/layout.tsx`, the nav brand span, or the Todos entries in the barrels/`TypedPocketBase`
  interfaces, update the matching strings in `EXAMPLE_PATHS`, `retitleApp`, and `removeExample`.

Verify changes end to end by running the script into a scratch copy of the repo and then running
`yarn install --immutable` and `yarn precommit` there — both branches (`--example` and
`--no-example`) should come out clean.

## Architecture

Next.js frontend + PocketBase backend. **All data access is client-side**: the browser talks to PocketBase directly via the JS SDK. There are no route handlers, no server actions, and no server-side PocketBase client — every page under `webapp/src/app/` is `'use client'`. `docs/PB_SSR.md` explains why (a module-scoped `pb` instance would leak auth state across server requests) — keep new data access on the client.

Data flows in layers, top to bottom:

| Layer | Location | Role |
|---|---|---|
| Schema | `webapp/src/schema/*.ts` | zod + `pocketbase-zod-schema` `defineCollection` — field validation **and** PocketBase access rules |
| Mutators | `webapp/src/mutators/*.ts` | `BaseMutator` subclasses: typed CRUD, filter/sort/expand defaults, realtime subscribe |
| Services | `webapp/src/services/auth.ts` | high-level auth ops over the user mutator + `pb.authStore` |
| Contexts | `webapp/src/contexts/*.tsx` | React state, optimistic updates, subscription lifecycle |
| Components | `webapp/src/components/` | shadcn/ui primitives in `ui/`, feature components alongside |

### `@template-ware/shared` is an alias, not a package

It resolves into `webapp/src` and is declared in **two places that must stay in sync**: `paths` in `webapp/tsconfig.json` and `resolve.alias` in `webapp/vitest.config.mjs`. Subpaths: bare `@template-ware/shared` → `src/shared/index.ts` (schemas + `lib/{errors,retry,loading-manager}` only), `/schema` → `src/schema/index.ts`, `/mutators` → `src/mutators/index.ts`. Mutators are deliberately kept out of the bare barrel.

### Schema definitions vs. migrations

`webapp/src/schema/*.ts` is where collection fields and API rules are *authored*, but the database is created from the committed JS migrations in `pocketbase/pb_migrations/`, which PocketBase auto-applies on boot. **Editing a zod schema does not change the database** — run `yarn db:status` to see the drift, then `yarn db:generate` to write the migration.

`pocketbase-migrate.config.mjs` (repo root) points the CLI at `webapp/src/schema` and `pocketbase/pb_migrations`; `schema.exclude` is intentionally left at its default so the `index.ts` barrel stays out of schema discovery. `verify: true` round-trips `up()`/`down()` before writing, so a migration that can't roll back is refused.

`yarn db:status` currently reports real drift: `Todos.title` and `Todos.description` carry min/max constraints in the zod schema that the committed migration never applied, so the database does not enforce them. Closing that gap means generating a migration — a deliberate schema change, not a cleanup.

`db:status` **exits 0 even when drift exists**, so never treat it as a gate; parse `pocketbase-migrate status --json` (`"status": "changes-pending"`) for that. `db:verify` and `db:lint` do exit non-zero.

`yarn typegen` writes `webapp/src/types/pocketbase-types.ts` (kept out of the schema directory so generated output is never parsed as a collection definition). Nothing imports it yet — the generated `TypedPocketBase` types only the capitalized collection names, so it is not a drop-in replacement for the hand-written ones described below.

### Authorization lives in PocketBase rules

Per-user scoping is enforced by collection rules (e.g. Todos: `@request.auth.id != "" && user = @request.auth.id`), so mutators intentionally set no user filter. The flip side: `TodoMutator.create` must inject `user: pb.authStore.record.id` itself, because `createRule` requires the field to match the caller. New per-user collections should follow the same pattern.

### Auth state

`pb.authStore` is the source of truth; `AuthProvider` (mounted globally in `app/layout.tsx`) mirrors it via `authStore.onChange` and revalidates with `authRefresh()` on mount, every 5 minutes, on window focus, and on `online`. Read auth through `useAuth()`, never by re-reading `authStore` in components. `TodoProvider`, by contrast, is mounted per-page in `app/todos/page.tsx`.

`TodoContext` applies optimistic updates with rollback on failure *and* holds a realtime `'*'` subscription, so writes can land twice — dedupe by id when adding to that path.

### Cross-cutting helpers

`parseAuthError` (`lib/errors.ts`) normalizes PocketBase `ClientResponseError` into `{type, message, fieldErrors}` for display; `withRetry` (`lib/retry.ts`) retries only network/5xx, never 4xx; `globalLoadingManager` (`lib/loading-manager.ts`) tracks named loading keys.

### Collection-name casing

Mutators call `pb.collection('Todos')` / `'Users'` while auth and realtime code call `'todos'` / `'users'`. Both casings are typed in `webapp/src/lib/types.ts`; `webapp/src/types/index.ts` declares a second, stricter `TypedPocketBase` with only the capitalized names. Match whatever the surrounding file does.

## Testing

Vitest + happy-dom with `globals: true`. Tests live in `webapp/src/test/__tests__/` and are excluded from ESLint. `src/test/setup.ts` mocks `next/navigation`, `next/image`, `next/link`, and `sonner` globally.

No live PocketBase is needed — use `src/test/__tests__/fixtures/pocketbase.ts` (`MockAuthStore`, `createMockPocketBase`, `createMockUser`), which reproduces the `authStore.onChange` behavior contexts depend on.

## Config and deployment

- `POCKETBASE_VERSION` in `.env.example` is the single source of truth for the binary version — `scripts/setup-pocketbase.js`, the Dockerfiles, and CI all read it from there. Bump it in that one file.
- `NEXT_PUBLIC_POCKETBASE_URL` is inlined at **build** time: `http://localhost:8090` for dev, `/` for the container images (same-origin behind nginx, so no CORS).
- `PUBLIC_POCKETBASE_URL` is the **runtime** counterpart — deliberately unprefixed so Next never inlines it. `webapp/src/lib/runtime-config.ts` is the whole contract: the root layout reads it from `process.env` per request (hence `export const dynamic = 'force-dynamic'` there) and emits an inline script setting `globalThis.__APP_RUNTIME_CONFIG__`; `resolveUrl()` in `lib/pocketbase.ts` takes it as its highest-priority tier. **Read `process.env` inside the request path, never at module scope** — a module-scope read is evaluated during `next build` and bakes the value back in, which is the bug this exists to fix. A runtime `NEXT_PUBLIC_POCKETBASE_URL` is deliberately *not* honoured: `.env.example` ships an inert `http://localhost:8090` and honouring it would break same-origin deployments.
- **Nothing may touch the `pb` singleton at module scope.** React hoists Next's async bundle chunks above anything the root layout emits, so the inline script cannot be relied on to run first; `AuthProvider` calls `syncBaseUrl()` during its render (above every consumer) to reconcile `pb.baseURL`. That is only sufficient while every importer uses `pb` inside a render, effect, or callback.
- `docker/Dockerfile` is the all-in-one image (nginx + Next.js + PocketBase under supervisord, all state in `/data`). `docker/Dockerfile.webapp` + `docker/Dockerfile.pocketbase` build the two halves separately; those images have no nginx, so a proxy has to put them on one origin. `NEXT_STANDALONE=1` (set only by `Dockerfile.webapp`) is the one thing that switches `next.config.ts` to `output: 'standalone'`. There are no Kubernetes manifests in this repo — they were removed in `be4d594`, and the docs no longer reference them.
- `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` are read only by `docker/pb-entrypoint.sh`, which upserts that superuser on boot. The migration scripts need no credentials — they work off files on disk.
- Commit messages drive releases via release-please — use Conventional Commits (`feat:`, `fix:`, `feat!:`).
- Styling is Tailwind v4 CSS-first (`src/app/globals.css`, `@tailwindcss/postcss`); there is no `tailwind.config`. UI components come from shadcn/ui (`new-york`, lucide icons).

## Repo quirks

- `pocketbase-zod-schema` is declared in **both** `webapp/package.json` (the schema files import it at runtime) and the root `package.json` (Yarn 4 only exposes a bin to the workspace that declares the dependency, so the root needs it for the `db:*` scripts). Keep the versions matched.
- `.github/workflows/ci.yml` gates pull requests with lint, formatting, typecheck, tests, migration lint, and a production build. `.github/workflows/release.yml` handles release-please plus multi-arch image builds.
