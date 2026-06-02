#!/usr/bin/env bash
# Build, load, and deploy starter-ware to a local Kubernetes cluster.
#
# Usage:
#   ./k8s/deploy-local.sh [kind|minikube]   (default: kind)
#
# Steps: build both images → load them into the cluster → apply manifests →
# wait for rollout → create the first PocketBase superuser (idempotent).
set -euo pipefail

CLUSTER="${1:-kind}"
PB_IMAGE="starter-ware-pocketbase:local"
WEB_IMAGE="starter-ware-webapp:local"
NS="starter-ware"
ADMIN_EMAIL="${PB_ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${PB_ADMIN_PASSWORD:-change-me-123}"

# Resolve repo root (parent of this script's dir) so the build context is correct.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Building images (context: $ROOT)"
docker build -f docker/Dockerfile.pocketbase -t "$PB_IMAGE" .
docker build -f docker/Dockerfile.webapp -t "$WEB_IMAGE" \
  --build-arg NEXT_PUBLIC_POCKETBASE_URL=/ .

echo "==> Loading images into $CLUSTER"
case "$CLUSTER" in
  kind)
    kind load docker-image "$PB_IMAGE" "$WEB_IMAGE"
    ;;
  minikube)
    minikube image load "$PB_IMAGE"
    minikube image load "$WEB_IMAGE"
    ;;
  *)
    echo "Unknown cluster '$CLUSTER' (expected: kind or minikube)" >&2
    exit 1
    ;;
esac

echo "==> Applying manifests"
kubectl apply -f k8s/

echo "==> Waiting for rollouts"
kubectl -n "$NS" rollout status deploy/pocketbase
kubectl -n "$NS" rollout status deploy/webapp

echo "==> Ensuring PocketBase superuser ($ADMIN_EMAIL)"
kubectl -n "$NS" exec deploy/pocketbase -- \
  ./pocketbase superuser upsert "$ADMIN_EMAIL" "$ADMIN_PASSWORD"

echo
echo "Done. App: http://localhost/   Admin: http://localhost/_/"
echo "(minikube users: run 'minikube tunnel' or browse http://\$(minikube ip)/)"
