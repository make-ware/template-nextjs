# starter-ware

A boilerplate for building apps with **[Next.js](https://nextjs.org/)** + **[PocketBase](https://pocketbase.io/)**, ready to run as a single all-in-one container **or** as two independently deployable images.

PocketBase gives you an instant backend (SQLite, auth, file storage, realtime, admin UI); Next.js gives you the frontend. This template wires them together, ships container images, and automates versioned multi-arch releases to a registry.

## Stack

- **Next.js 16** (App Router) + **React 19**, **Tailwind CSS v4**, **Radix UI**, **react-hook-form** + **zod**
- **PocketBase 0.32** — API, auth, SQLite, file uploads, realtime, admin UI
- **TypeScript** end to end; PocketBase types generated from collections
- **Yarn 4** workspaces monorepo
- **Docker** — single all-in-one container, or separate webapp / PocketBase images
- **release-please** + **GitHub Actions** → versioned multi-arch images on GHCR

## Example app

The template ships a small working app so the wiring is demonstrated, not just described:

- **Auth** — sign up, log in, profile (`/signup`, `/login`, `/profile`)
- **Todos** — a `Todos` collection with per-user access rules and a CRUD UI (`/todos`)

Collections and rules live in [pocketbase/pb_migrations/](pocketbase/pb_migrations/) and apply automatically on first boot.

## Architecture

```
                    ┌─────────────────────────────┐
  Browser  ───────► │  Next.js (frontend, SSR)    │
                    └─────────────────────────────┘
       │  /api, /_  (same-origin, NEXT_PUBLIC_POCKETBASE_URL=/)
       ▼
                    ┌─────────────────────────────┐
                    │  PocketBase (API + admin)   │  ── SQLite + uploads (persistent)
                    └─────────────────────────────┘
```

The browser talks to PocketBase directly (the JS SDK runs client-side). **nginx** inside the
single-container image keeps everything same-origin, so no CORS configuration is needed. If you
split the two images apart, put your own proxy or router in front of them to preserve that.

```
starter-ware/
├── webapp/              # @template-ware/webapp — Next.js app
│   └── src/
│       ├── app/         # routes (login, signup, profile, todos)
│       ├── lib/         # pocketbase.ts client, shared utils
│       ├── schema/      # generated PocketBase types + zod schemas
│       ├── mutators/    # data-layer CRUD
│       └── ...          # components, contexts, services
├── pocketbase/          # @template-ware/pb — binary (downloaded), hooks, migrations
│   ├── pb_hooks/        # server-side JS hooks
│   └── pb_migrations/   # schema migrations (auto-applied on boot)
├── docker/              # Dockerfile (monolith) + Dockerfile.webapp / .pocketbase
├── docs/                # PocketBase usage guides (auth, realtime, uploads, …)
└── .github/workflows/   # release.yml — release-please + image publishing
```

> `@template-ware/shared` is a TypeScript path alias into `webapp/src` (see `webapp/tsconfig.json`), not a separate package.

## Quick start (local development)

Requires **Node 20+**, **Yarn 4** (via Corepack), and a POSIX shell.

```bash
corepack enable          # enables the pinned Yarn 4
yarn install             # install dependencies
yarn setup               # download the PocketBase binary for your platform
cp .env.example .env     # configure (defaults work for local dev)

yarn dev                 # start Next.js (:3000) and PocketBase (:8090) together
```

Then:

- App → <http://localhost:3000>
- PocketBase admin UI → <http://localhost:8090/_/> (create the first superuser on first visit)

### Common scripts (run from the repo root)

| Script | Description |
|--------|-------------|
| `yarn dev` | Run Next.js + PocketBase concurrently |
| `yarn build` | Build all workspaces |
| `yarn test` | Run webapp tests (Vitest) |
| `yarn typecheck` | Type-check all workspaces |
| `yarn lint` / `yarn format` | Lint-fix / format |
| `yarn precommit` | Lint + typecheck + format + test |
| `yarn setup` | (Re)download the PocketBase binary |

### Schema and migration scripts

The zod collection definitions in `webapp/src/schema/` are the source of truth for fields and API
rules; the files in `pocketbase/pb_migrations/` are what PocketBase actually applies on boot. These
scripts (backed by [`pocketbase-zod-schema`](https://github.com/dastron/pocketbase-zod-schema), configured
in [pocketbase-migrate.config.mjs](pocketbase-migrate.config.mjs)) keep the two honest:

| Script | Description |
|--------|-------------|
| `yarn db:status` | Diff the zod schemas against the committed migrations — reports any drift |
| `yarn db:verify` | Check which committed migrations the local database has actually applied |
| `yarn db:generate` | Write a migration for the pending schema changes |
| `yarn db:lint` | Check migrations for JS that Node accepts but PocketBase's goja runtime rejects |
| `yarn typegen` | Generate `webapp/src/types/pocketbase-types.ts` from the schemas |

Editing a zod schema does **not** change the database on its own — run `yarn db:status`, then
`yarn db:generate` to produce the migration. `db:verify` reads `pocketbase/pb_data`, so it needs
PocketBase to have run at least once (and Node ≥ 22.5 for `node:sqlite`).

None of these run in `yarn precommit`; `db:status` is meant to be run deliberately when you touch a
schema.

> Note on exit codes: `db:status` **exits 0 even when it reports drift**, so it reads as a report,
> not a gate. If you want to fail a build on drift, parse `pocketbase-migrate status --json` (it
> emits `"status": "changes-pending"`). `db:verify` and `db:lint` do exit non-zero on a problem.

## Configuration

See [.env.example](.env.example). Key variables:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_POCKETBASE_URL` | webapp (build-time, client-side) | Base URL the browser uses for PocketBase. `http://localhost:8090` for dev; `/` when a proxy puts both on one origin |
| `POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD` | container entrypoint | When both are set, the entrypoint upserts this superuser on boot (idempotent); otherwise PocketBase prints a one-time setup URL |
| `NODE_ENV` | both | `development` / `production` |

> `NEXT_PUBLIC_*` is inlined into the JS bundle **at build time**, so the container images set it to `/` (same-origin via the proxy) — no CORS needed.

## Deployment

### 1. Single container (simplest)

One image runs Next.js + PocketBase + nginx under supervisor; all state lives in `/data`.

```bash
docker build -f docker/Dockerfile -t starter-ware .
docker run -d -p 80:80 -v "$PWD/data:/data" starter-ware
```

Details, env vars, and backups: [docker/README.md](docker/README.md).

### 2. Split images (two containers)

`docker/Dockerfile.webapp` and `docker/Dockerfile.pocketbase` build the two halves separately, for
when you want to scale the stateless frontend independently of the single stateful PocketBase
instance. The webapp image builds with `NEXT_STANDALONE=1` (a self-contained `.next/standalone`
server) and expects `NEXT_PUBLIC_POCKETBASE_URL=/`, so front them with a proxy or router that serves
both on one origin — nginx is only bundled in the monolith image.

```bash
docker build -f docker/Dockerfile.pocketbase -t starter-ware-pocketbase .
docker build -f docker/Dockerfile.webapp --build-arg NEXT_PUBLIC_POCKETBASE_URL=/ -t starter-ware-webapp .
```

### 3. Published images

On each release, [`.github/workflows/release.yml`](.github/workflows/release.yml) publishes
multi-arch (`amd64` + `arm64`) images to GHCR:

- `ghcr.io/<owner>/<repo>/monolith` — all-in-one
- `ghcr.io/<owner>/<repo>/webapp` — Next.js only
- `ghcr.io/<owner>/<repo>/pocketbase` — PocketBase only

Versioning is driven by **release-please** from [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `feat!:`). Merging the release PR cuts a tag, updates `CHANGELOG.md`, and pushes
images tagged `X.Y.Z`, `X.Y`, `X`, and `latest`. See
[docker/README.md](docker/README.md#published-images-ci--release-please).

## Documentation

PocketBase usage guides live in [docs/](docs/): [intro](docs/PB_INTRO.md),
[collections](docs/PB_COLLECTIONS.md), [auth](docs/PB_AUTH.md),
[relationships](docs/PB_RELATIONSHIPS.md), [filters](docs/PB_FILTERS.md),
[realtime](docs/PB_REALTIME.md), [uploads](docs/PB_UPLOADS.md),
[SSR](docs/PB_SSR.md), and [extending with hooks](docs/PB_EXTENDING.md).

## License

See [LICENSE](LICENSE).
