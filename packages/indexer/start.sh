#!/usr/bin/env bash
# Start MUD sqlite-indexer for BSC World. Run on the game server, then reverse-proxy
# the PORT to a public HTTPS host and set client VITE_INDEXER_URL to that host.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
ENV_FILE="${1:-$ROOT/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "Copy packages/indexer/.env.example to packages/indexer/.env and edit it."
  exit 1
fi

mkdir -p "$ROOT/data"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${RPC_HTTP_URL:?RPC_HTTP_URL required}"
: "${START_BLOCK:?START_BLOCK required}"
: "${STORE_ADDRESS:?STORE_ADDRESS required}"

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-3001}"
export MAX_BLOCK_RANGE="${MAX_BLOCK_RANGE:-500}"
export FOLLOW_BLOCK_TAG="${FOLLOW_BLOCK_TAG:-latest}"
export SQLITE_FILENAME="${SQLITE_FILENAME:-$ROOT/data/bsc-indexer.db}"

# Resolve relative sqlite path against packages/indexer
case "$SQLITE_FILENAME" in
  /*) ;;
  *) SQLITE_FILENAME="$ROOT/${SQLITE_FILENAME#./}" ;;
esac
export SQLITE_FILENAME

echo "Starting sqlite-indexer"
echo "  STORE_ADDRESS=$STORE_ADDRESS"
echo "  START_BLOCK=$START_BLOCK"
echo "  MAX_BLOCK_RANGE=$MAX_BLOCK_RANGE"
echo "  SQLITE_FILENAME=$SQLITE_FILENAME"
echo "  listen=http://${HOST}:${PORT}"

cd "$REPO"
exec pnpm exec sqlite-indexer
