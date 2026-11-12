#!/usr/bin/env bash
# 本地链只留在内存里。进程退出后状态消失，下次启动从空链重新部署。
set -euo pipefail
cd "$(dirname "$0")/.."

RPC=http://127.0.0.1:8545
MULTICALL=0xcA11bde05977b3631167028862bE2a173976CA11
# 前端和 agent 都按这段字节码校验。地址必须是这条固定地址，不能另外部署一个新的。
EXPECTED=0xd5c15df687b16f2ff992fc8d767b4216323184a2bbc6ee2f9c398c318e770891

anvil \
  --host 127.0.0.1 \
  --port 8545 \
  --base-fee 1000000000 \
  --block-time 2 \
  --max-persisted-states 0 &
anvil_pid=$!

cleanup() {
  if kill -0 "$anvil_pid" 2>/dev/null; then
    kill "$anvil_pid" 2>/dev/null || true
    wait "$anvil_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

ready=0
for _ in $(seq 1 50); do
  if cast block-number --rpc-url "$RPC" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$anvil_pid" 2>/dev/null; then
    echo "anvil exited before the RPC was ready" >&2
    exit 1
  fi
  sleep 0.2
done
if [ "$ready" -ne 1 ]; then
  echo "anvil RPC did not become ready" >&2
  exit 1
fi

# anvil_setCode 不占部署者的 nonce，后面的合约地址不会因此挪动。
code=$(tr -d '[:space:]' < script/multicall3.bytecode)
cast rpc anvil_setCode "$MULTICALL" "$code" --rpc-url "$RPC" >/dev/null
actual=$(cast keccak "$(cast code "$MULTICALL" --rpc-url "$RPC")")
if [ "$actual" != "$EXPECTED" ]; then
  echo "Multicall3 bytecode hash mismatch: $actual" >&2
  exit 1
fi
echo "Multicall3 ready at $MULTICALL"

wait "$anvil_pid"
