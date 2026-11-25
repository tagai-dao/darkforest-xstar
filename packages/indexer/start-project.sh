#!/usr/bin/env bash
# Project Player / PlayerScore / PlayerKillStats from local sqlite-indexer into MySQL.
# Run after ./start.sh (store-indexer). The read-only API (packages/api pnpm start) only reads MySQL.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
ENV_FILE="${1:-$ROOT/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "Copy packages/indexer/.env.example and set DATABASE_URL."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${DATABASE_URL:?DATABASE_URL required for MySQL projection}"

# Projector talks to the local store-indexer HTTP, not the public URL.
export INDEXER_URL="${INDEXER_URL:-http://127.0.0.1:${PORT:-3001}}"
export WORLD_CHAIN_ID="${WORLD_CHAIN_ID:-56}"
export WORLD_ADDRESS="${WORLD_ADDRESS:-${STORE_ADDRESS:-}}"
export INITIAL_BLOCK_NUMBER="${INITIAL_BLOCK_NUMBER:-${START_BLOCK:-}}"

echo "Starting leaderboard projector"
echo "  INDEXER_URL=$INDEXER_URL"
echo "  WORLD_ADDRESS=$WORLD_ADDRESS"
echo "  INITIAL_BLOCK_NUMBER=$INITIAL_BLOCK_NUMBER"

cd "$REPO"
exec pnpm --filter api project
