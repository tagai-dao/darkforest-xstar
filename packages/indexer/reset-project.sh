#!/usr/bin/env bash
# Manually wipe MySQL leaderboard for this World and resync once from sqlite-indexer.
# Default is no-op unless the operator types RESET in an interactive TTY.
# Does not run as part of ./start-project.sh.
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

: "${DATABASE_URL:?DATABASE_URL required}"

export INDEXER_URL="${INDEXER_URL:-http://127.0.0.1:${PORT:-3001}}"
export WORLD_CHAIN_ID="${WORLD_CHAIN_ID:-56}"
export WORLD_ADDRESS="${WORLD_ADDRESS:-${STORE_ADDRESS:-}}"
export INITIAL_BLOCK_NUMBER="${INITIAL_BLOCK_NUMBER:-${START_BLOCK:-}}"

cd "$REPO"
exec pnpm --filter api project:reset
