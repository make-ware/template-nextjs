# Docker Image

Single-container deployment of the Next.js webapp + PocketBase + Nginx, supervised by `supervisord`. All runtime state lives under `/data` — bind-mount that one path and you're done.

## Architecture

- **Nginx** (port 80) — reverse proxy, public entry point
- **Next.js** (internal :3000) — frontend
- **PocketBase** (internal :8090) — API, admin UI, SQLite, file storage
- **Supervisor** — process manager

Hooks ([pocketbase/pb_hooks/](../pocketbase/pb_hooks/)) and migrations ([pocketbase/pb_migrations/](../pocketbase/pb_migrations/)) are baked into the image — they're code, not data. Source-tree path is `pocketbase/`; in the running container they live under `/app/pb/`.

## Build

From the repo root:

```bash
docker build -f docker/Dockerfile -t template-ware .
```

Pin a specific PocketBase release at build time:

```bash
docker build -f docker/Dockerfile \
  --build-arg POCKETBASE_VERSION=0.32.4 \
  --build-arg POCKETBASE_ARCH=amd64 \
  -t template-ware .
```

## Run

```bash
docker run -d --name template-ware \
  -p 80:80 \
  -v $PWD/data:/data \
  template-ware
```

Routes:

- `/` → Next.js
- `/api/` → PocketBase API
- `/_/` → PocketBase admin UI
- `/health` → PocketBase health probe

First boot: visit `/_/` to create the PocketBase admin account.

## The `/data` contract

Everything the running container persists writes to `/data`:

- `/data/pb_data/` — PocketBase SQLite (`data.db`, `auxiliary.db`) and file uploads (`storage/`)

Reserve the rest of `/data` for any future app-level dynamic state (cache, generated files). Mount one host directory to that path and your container is stateful; nothing else needs to be persisted.

The Dockerfile declares `VOLUME ["/data"]`, so an unconfigured `docker run` still gets a Docker-managed volume — you won't lose data by forgetting `-v`. Bind-mount in production for predictable backups.

### Backup and restore

```bash
# Back up
tar czf backup-$(date +%F).tgz -C $PWD data

# Restore on a fresh host
tar xzf backup-2026-05-05.tgz
docker run -d --name template-ware -p 80:80 -v $PWD/data:/data template-ware
```

Stop the container before backing up if you need a strictly consistent SQLite snapshot. PocketBase also exposes backup tooling at `/_/#/settings/backups` if you prefer in-app snapshots.

## Environment variables

Pass at `docker run` time:

```bash
docker run -d --name template-ware \
  -p 80:80 \
  -v $PWD/data:/data \
  -e NEXT_PUBLIC_POCKETBASE_URL=https://your-domain/api \
  -e NODE_ENV=production \
  template-ware
```

See [.env.example](../.env.example) for the full list.

## Logs

Supervisor writes per-process logs inside the container:

- `/var/log/supervisor/supervisord.log`
- `/var/log/supervisor/pocketbase.{out,err}.log`
- `/var/log/supervisor/nextjs.{out,err}.log`
- `/var/log/supervisor/nginx.{out,err}.log`

Tail them with `docker exec <container> tail -f /var/log/supervisor/supervisord.log`.

## Files in this directory

- [Dockerfile](Dockerfile) — multi-stage build
- [supervisord.conf](supervisord.conf) — process definitions; PocketBase invocation pins `--dir=/data/pb_data` plus `--hooksDir` / `--migrationsDir` against the in-image paths
- [nginx.conf](nginx.conf) — reverse-proxy routing, websocket support for PocketBase realtime
- [start.sh](start.sh) — entrypoint that execs supervisord
