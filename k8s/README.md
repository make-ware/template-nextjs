# Kubernetes deployment

This directory deploys `starter-ware` as **two pods** on a local cluster:

- **`pocketbase`** — a single instance with a persistent volume for the SQLite DB and file uploads.
- **`webapp`** — the Next.js app (stateless, 2 replicas).

An **Ingress** replaces the nginx reverse proxy used by the monolithic `docker/Dockerfile`,
routing `/api` and `/_` to PocketBase and everything else to Next.js. Because the browser
reaches PocketBase on the **same origin** (`/api/...`), the webapp image is built with
`NEXT_PUBLIC_POCKETBASE_URL=/` — no CORS needed.

> The monolithic `docker/Dockerfile` (PocketBase + Next.js + nginx in one container) is
> unchanged and remains the simplest single-container option. Use this k8s setup when you
> want the two tiers split into separate, independently-scalable pods.

## Manifests

| File | Resource |
|------|----------|
| `00-namespace.yaml` | Namespace `starter-ware` |
| `10-pocketbase-pvc.yaml` | PVC `pocketbase-data` (1Gi, RWO) |
| `20-pocketbase-deployment.yaml` | PocketBase Deployment (replicas: 1, **Recreate**) |
| `30-pocketbase-service.yaml` | Service `pocketbase` (ClusterIP :8090) |
| `40-webapp-deployment.yaml` | Next.js Deployment (replicas: 2) |
| `50-webapp-service.yaml` | Service `webapp` (ClusterIP :3000) |
| `60-ingress.yaml` | Ingress (path-based routing) |

## Prerequisites

- Docker, `kubectl`, and a local cluster: [kind](https://kind.sigs.k8s.io/) **or** [minikube](https://minikube.sigs.k8s.io/).
- An nginx ingress controller (installed below).

### kind: cluster with ingress port mappings

The ingress controller needs host ports 80/443 mapped into the kind node:

```yaml
# kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-labels: "ingress-ready=true"
    extraPortMappings:
      - containerPort: 80
        hostPort: 80
        protocol: TCP
      - containerPort: 443
        hostPort: 443
        protocol: TCP
```

```sh
kind create cluster --config kind-config.yaml
```

## 1. Build the images

Run from the **repo root** (the build context):

```sh
docker build -f docker/Dockerfile.pocketbase -t starter-ware-pocketbase:local .
docker build -f docker/Dockerfile.webapp     -t starter-ware-webapp:local \
  --build-arg NEXT_PUBLIC_POCKETBASE_URL=/ .
```

> **Apple Silicon / arm64:** the PocketBase image defaults to `POCKETBASE_ARCH=amd64`. If your
> cluster node is arm64, build with `--build-arg POCKETBASE_ARCH=arm64` (and matching
> `--platform linux/arm64`); otherwise add `--platform linux/amd64` to both builds so the
> binary arch matches the node.

Optionally smoke-test before deploying:

```sh
docker run --rm -p 8090:8090 starter-ware-pocketbase:local   # then curl localhost:8090/api/health
docker run --rm -p 3000:3000 starter-ware-webapp:local       # then open localhost:3000
```

## 2. Load the images into the cluster

The manifests use `imagePullPolicy: IfNotPresent`, so the images must be present on the node
(there is no registry push).

```sh
# kind
kind load docker-image starter-ware-pocketbase:local starter-ware-webapp:local

# minikube
minikube image load starter-ware-pocketbase:local
minikube image load starter-ware-webapp:local
```

## 3. Install the nginx ingress controller

```sh
# kind
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

# minikube
minikube addons enable ingress
```

## 4. Deploy

```sh
kubectl apply -f k8s/
kubectl -n starter-ware rollout status deploy/pocketbase
kubectl -n starter-ware rollout status deploy/webapp
```

## 5. Create the first PocketBase superuser

A fresh volume auto-applies migrations on boot but has **no admin account**. Create one
(idempotent):

```sh
kubectl -n starter-ware exec deploy/pocketbase -- \
  ./pocketbase superuser upsert admin@example.com 'change-me-123'
```

## 6. Verify

```sh
curl -i http://localhost/            # 200 HTML (Next.js)
curl http://localhost/api/health     # {"code":200,...} (PocketBase via Ingress)
```

- Open <http://localhost/> for the app and <http://localhost/_/> for the PocketBase admin UI
  (log in with the superuser from step 5).
- Create a Todo in the UI to exercise same-origin `/api` routing through the Ingress.

> **minikube:** if `localhost` doesn't route, use `minikube tunnel` (run in a separate terminal)
> or browse `http://$(minikube ip)/`.

### Persistence check

```sh
kubectl -n starter-ware rollout restart deploy/pocketbase
kubectl -n starter-ware rollout status deploy/pocketbase
```

The superuser and any Todos must survive — confirming the PVC persists data and that the
`Recreate` strategy cleanly releases and reattaches the volume.

## Notes

- **Single PocketBase instance:** SQLite is a single-writer embedded DB. PocketBase stays at
  `replicas: 1` with `strategy: Recreate`. Do not scale it up or switch to `RollingUpdate` —
  two pods on the same RWO volume cause Multi-Attach errors and DB corruption.
- **`/health` Ingress rule omitted:** it only served the monolith's Docker `HEALTHCHECK`. K8s
  probes hit `/api/health` on the pod directly.
- **Convenience:** `./k8s/deploy-local.sh kind` runs build → load → ingress wait → apply →
  superuser in one shot (pass `minikube` to target minikube).
