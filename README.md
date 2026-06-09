# starter-ware

A boilerplate for building apps with **[Next.js](https://nextjs.org/)** + **[PocketBase](https://pocketbase.io/)**, ready to run as a single container **or** as two pods in a **Kubernetes** cluster.

PocketBase gives you an instant backend (SQLite, auth, file storage, realtime, admin UI); Next.js gives you the frontend. This template wires them together, ships container images, and automates versioned multi-arch releases to a registry.

## Stack

- **Next.js 16** (App Router) + **React 19**, **Tailwind CSS v4**, **Radix UI**, **react-hook-form** + **zod**
- **PocketBase 0.32** — API, auth, SQLite, file uploads, realtime, admin UI
- **TypeScript** end to end; PocketBase types generated from collections
- **Yarn 4** workspaces monorepo
- **Docker** (single-container and split images) + **Kubernetes** manifests
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

The browser talks to PocketBase directly (the JS SDK runs client-side). A reverse proxy keeps
everything same-origin: **nginx** in the single-container image, an **Ingress** in Kubernetes.

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
├── k8s/                 # plain-YAML manifests + deploy-local.sh
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
| `yarn typegen` | Regenerate PocketBase types in the webapp |
| `yarn setup` | (Re)download the PocketBase binary |

## Configuration

See [.env.example](.env.example). Key variables:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_POCKETBASE_URL` | webapp (build-time, client-side) | Base URL the browser uses for PocketBase. `http://localhost:8090` for dev; `/` behind the proxy/Ingress |
| `POCKETBASE_URL`, `POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD` | migration tooling | Admin auth for pushing migrations |
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

### 2. Kubernetes (two pods)

PocketBase (single instance + PersistentVolume) and Next.js (stateless, scalable) as separate
pods, with an Ingress replacing nginx. Full local walkthrough (kind/minikube):
[k8s/README.md](k8s/README.md).

```bash
./k8s/deploy-local.sh kind     # build → load → apply → create superuser
```

### 3. Published images

On each release, [`.github/workflows/release.yml`](.github/workflows/release.yml) publishes
multi-arch (`amd64` + `arm64`) images to GHCR:

- `ghcr.io/<owner>/<repo>/monolith` — all-in-one
- `ghcr.io/<owner>/<repo>/webapp` — Next.js (for k8s)
- `ghcr.io/<owner>/<repo>/pocketbase` — PocketBase (for k8s)

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
