# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A full-chain incomplete-information space strategy game built on Lattice MUD. It's a community Dark Forest reimplementation: world state lives on-chain in MUD Store tables, client handles exploration/mining/SNARK proof generation/WebGL rendering, and player actions settle through World contract `df__*` system calls.

## Monorepo Structure (pnpm workspaces)

- `packages/contracts` — MUD config, Solidity systems, libraries, Foundry tests, deploy scripts
- `packages/client` — React + Vite game client, MUD sync, WebGL renderer, SNARK prover, IndexedDB cache
- `packages/api` — Express + MySQL indexer (MUD store-sync)

## Common Commands

```bash
# Root level
pnpm install            # Install all deps (requires pnpm >=10.7.1, Node 20.19.0)
pnpm dev                # Launch all processes via mprocs (anvil + contracts + client + explorer + api)
pnpm build              # Build all packages
pnpm test               # Run all tests (includes tsc typecheck + mud test for contracts)
pnpm lint               # ESLint + prettier + solhint across all packages
pnpm format             # Prettier all files

# Contracts only
pnpm --filter contracts dev     # mud dev-contracts against local anvil
pnpm --filter contracts test    # tsc --noEmit && mud test

# Run a single Foundry test
cd packages/contracts && forge test --match-test <testName> -vvv

# Client only
pnpm --filter client dev        # Vite dev server (waits for port 8545)
pnpm --filter client test       # vitest run

# API only
pnpm --filter api dev           # tsx watch src/main.ts

# Deploy contracts
cd packages/contracts
pnpm mud deploy                 # local
pnpm mud deploy --profile=garnet/redstone/base/optimism
```

## Architecture (MUD ECS)

**Tables** are defined in `packages/contracts/mud.config.ts` — 70+ tables covering players, planets, moves, artifacts, guilds, materials, space junk, etc. Namespace: `df`.

**Systems** (`packages/contracts/src/systems/`) are Solidity contracts with game logic:

- `PlayerSystem` — register, spawn
- `MoveSystem` — move fleets, revert moves, combat resolution
- `ArtifactSystem` — prospect, find, activate, charge, shutdown artifacts
- `PlanetUpgradeSystem` — upgrade range/speed/defense
- `PlanetRevealSystem` — reveal coordinates on-chain
- `PlanetJunkSystem` — add/clear/buy space junk
- `GuildSystem` — create, invite, apply, manage guilds
- `PlanetWithdrawSilverSystem` / `WithdrawMaterialSystem` — resource withdrawal and scoring
- `BuySilverSystem` — silver purchase via DFXStar staking
- `AdminSystem` / `InitializeSystem` — admin and world initialization

**Libraries** (`packages/contracts/src/lib/`) contain pure computation:

- `Planet.sol` — planet initialization, growth (logistic curve), sync, properties
- `Move.sol` — fleet loading, distance/arrival calculation, combat
- `Universe.sol` — map generation (MiMC hash, Perlin noise, sparsity check)
- `SnarkProof.sol` — Groth16 proof verification
- `Artifact.sol` — artifact discovery, rarity, type assignment
- `DFUtils.sol` — tick management, common helpers
- `Effect.sol` — artifact effect/modifier system

**Artifact modules** (`packages/contracts/src/modules/atfs/`) — modular artifact systems (PhotoidCannon, Wormhole, BloomFilter, PinkBomb) wired via `ArtifactProxySystem`.

## Key Domain Concepts

- **Coordinate privacy**: Client mines planet hashes locally; SNARK proofs verify actions without revealing coordinates. Proofs are in `packages/client/src/Shared/snarks/` (WASM + zkey).
- **Lazy planet generation**: Planets are not pre-stored. First read initializes constants from hash + Perlin noise.
- **Tick-based time**: `Ticker` table tracks game time. `TickSystem.tick` advances based on real time. Planet growth uses logistic curves.
- **Planet types**: PLANET (upgradeable), ASTEROID_FIELD (materials), FOUNDRY (artifact discovery), SPACETIME_RIP (withdrawal/scoring), QUASAR (special).
- **Space types**: NEBULA, SPACE, DEEP_SPACE, DEAD_SPACE — affect level caps and bonuses.
- **Space Junk**: Expansion cost system. Once enabled, many operations require owner == junkOwner.
- **Client enum mapping**: Client uses old Dark Forest names — `RUINS` maps to contract `FOUNDRY`, `TRADING_POST` maps to `SPACETIME_RIP`.

## Client Architecture

- `packages/client/src/mud/` — MUD network setup (`syncToRecs`), system call wrappers
- `packages/client/src/Backend/` — `GameManager`, `ContractsAPI`, game logic orchestration
- `packages/client/src/Frontend/` — React UI components
- `packages/client/src/BluePill/` / `RedPill/` — game view modes
- `packages/client/src/Shared/` — types, constants, SNARK circuits, utilities
- `packages/client/src/wallet/` — viem/wagmi/RainbowKit integration
- Client uses Web Workers for mining, WebGL for rendering, IndexedDB for local caching

## Tech Stack

- **Contracts**: Solidity 0.8.24, Foundry, MUD 2.2.23 (pinned pre-release)
- **Client**: React 18, Vite 6, TypeScript 5.6.3, viem 2.26, wagmi 2.14, RainbowKit 2.2
- **State**: MUD RECS (ECS component store), zustand, rxjs
- **ZK**: snarkjs (Groth16 proofs)
- **API**: Express, MySQL, WebSocket, MUD store-sync indexer

## Code Conventions

- Solidity: 2-space indent, 120-char line length, bracket spacing (see `foundry.toml [fmt]`)
- Contracts lint: `prettier-plugin-solidity` + `solhint` with `solhint-config-mud`
- TypeScript/JS lint: ESLint + Prettier with Tailwind plugin
- Commit messages: conventional commits enforced by commitlint + husky
- Pre-commit hooks: lint-staged runs ESLint on `*.{js,ts,tsx,json}` and Prettier on `*.{ts,tsx,js,json,sol,md}`

## Key Config Files

- `packages/contracts/mud.config.ts` — MUD world definition (all tables, enums, systems)
- `packages/contracts/foundry.toml` — Foundry/Solidity config with network profiles (garnet, redstone, base, optimism)
- `mprocs.yaml` — Dev process definitions
- `PROJECT_MANUAL_CN.md` — Detailed Chinese-language design doc covering game mechanics, strategy, and code observations
