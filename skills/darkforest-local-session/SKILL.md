---
name: darkforest-local-session
description: Join the local Dark Forest simulation, initialize a home planet, mine outward from that home, and play with a named strategy file. Use when the owner wants an agent to start this local game, stake an AIPRO NFT, spawn a home, mine, or take the next game action.
---

# Local simulation

The owner does not know the chain, contracts, or price. Do not ask for them. The addresses below are the contracts for this game. Read them from the chain and stop if they do not match. Do not switch chains. Do not deploy contracts. If Multicall3 or the World has no code, stop.

| Item            | Value                                                                                   |
| --------------- | --------------------------------------------------------------------------------------- |
| Chain ID        | `31337`                                                                                 |
| RPC             | `http://127.0.0.1:8545` (`http://localhost:8545` is the same)                           |
| World           | `0x3295A33430Bb33696b5F04DC12DD91276213100e`                                            |
| AIPRO NFT       | `0x90c84237fDdf091b1E63f369AF122EB46000bc70`                                            |
| Handle registry | `0x3D63c50AD04DD5aE394CAB562b7691DD5de7CF6f`                                            |
| Locker          | `0x103A3b128991781EE2c8db0454cA99d67b257923`                                            |
| Entry           | Stake one AIPRO NFT in the locker. There is no DFPT and no pass to buy.                 |
| Season          | Read `activeSeason()` on the locker.                                                    |
| Multicall3      | `0xcA11bde05977b3631167028862bE2a173976CA11`. If this address has no code, stop.        |
| Player          | The wallet the owner connected for this run. Do not write that address into this skill. |

Use these addresses. If this wallet is not already in the season, approve one NFT to the locker, then call `stake` on the locker. Stake transfers that NFT into the locker, so a wallet already in the season has an NFT balance of 0 and still plays. Do not call `mint` or `setHandle`. If a chain read of the NFT, the handle registry, the locker, or the World does not match this table, stop.

Set both `NO_PROXY=127.0.0.1,localhost` and `no_proxy=127.0.0.1,localhost` before calling the RPC. If the RPC cannot be reached, stop.

## Ask first

After reading this skill, ask whether to start. Do not ask again in this conversation if the owner already answered.

> Start this local simulation? I will read the connected wallet and then decide whether to stake an AIPRO NFT for this season, or initialize a home.

If the owner says no, stop. Do not read the chain and do not create a folder.

The save root is the folder the owner names for this run. If they have not named one, ask once before creating files. Reuse that folder for the same wallet. Do not invent a disk path, and do not reuse another person's folder. Do not put the save inside this repository, on the Desktop, in Documents, in iCloud, or under `~/Library`. The browser cannot open `~/Library`.

## Reads

Every chain read goes through Multicall3 `aggregate3`. Do not send a separate `eth_call` for each value. Set `allowFailure` to false. Do not send ETH to Multicall3, and do not call `aggregate3Value`. If one call fails, stop and tell the owner. Writes stay separate transactions to the AIPRO NFT, the locker, and the world. Do not call a DFPT token or `buyPass`.

The locker address is not fixed. Read it from the world table `GamePassNFT`, then read the NFT and the handle registry from that locker.

| Table       | Id                                                                   |
| ----------- | -------------------------------------------------------------------- |
| GamePassNFT | `0x7462646600000000000000000000000047616d65506173734e46540000000000` |

The first batch is the ETH balance and that table. The table key is empty. Its static data is one address, 20 bytes packed from the left. That address is the locker. An empty record, or an address of zero, means this world has no locker. Stop and tell the owner. Do not register and do not look for a pass to buy.

```bash
export NO_PROXY=127.0.0.1,localhost
export no_proxy=127.0.0.1,localhost
RPC=http://127.0.0.1:8545
MULTI=0xcA11bde05977b3631167028862bE2a173976CA11
WORLD=0x3295A33430Bb33696b5F04DC12DD91276213100e

ETH=$(cast calldata "getEthBalance(address)" <player>)
LOCKER_REC=$(cast calldata "getRecord(bytes32,bytes32[])" 0x7462646600000000000000000000000047616d65506173734e46540000000000 "[]")

cast call $MULTI \
  "aggregate3((address,bool,bytes)[])((bool,bytes)[])" \
  "[($MULTI,false,$ETH),($WORLD,false,$LOCKER_REC)]" \
  --rpc-url $RPC
```

The second batch uses the locker from that read. `nft()` and `handleRegistry()` are the contracts for the steps below. Do not reuse an address from an older session.

1. Locker `isSeasonOpen()`
2. Locker `activeWorld()`
3. Locker `activeSeason()`
4. Locker `isPlayerInActiveSeason(player)`
5. Locker `stakedTokenOf(player)`
6. Locker `nft()`
7. Locker `handleRegistry()`
8. Handle registry `handleOf(player)`
9. NFT `balanceOf(player)`

Each result is `(bool success, bytes returnData)`. `returnData` is ABI-encoded: a `uint256` or `bool` is one 32-byte word, an address is the last 20 bytes of that word, and a string is a dynamic ABI string.

`isPlayerInActiveSeason(player)` is whether this wallet may play. Stake moves the NFT into the locker, so a wallet already in this season has `balanceOf` 0. That 0 is expected. Do not treat it as a missing NFT, and do not call `tokenOfOwnerByIndex` on that wallet. Its token id is `stakedTokenOf(player)`. The locker holds the token.

Only when `isPlayerInActiveSeason(player)` is false and `balanceOf(player)` is greater than 0, send another `aggregate3` with `tokenOfOwnerByIndex(player, 0)`. That token is the one to stake. Do not guess token ids, and do not stake a second one. One wallet stakes one NFT for the open season.

Home, registration, and the inner circle are the batch in [home.md](home.md).

## Read the connected wallet

The player is the wallet the owner connected for this run. Before any signed call, derive the address from that signer and require an exact match. Never put the key or the address into this skill, a game save, a script, a tool argument, or the macOS Keychain. If the runtime signer is gone, stop signed actions and ask the owner to connect the wallet again. Do not switch to another account.

Each wallet has its own NFT, handle, registration, balances, home, and save folder. Read those on chain before acting. Do not copy another wallet's files, spending authorization, or transaction log. A one-off request to start this wallet does not restart a stopped mining process or paused strategy automation.

Read all of these before deciding:

- Local ETH balance, for gas
- The locker address from `GamePassNFT`
- `isSeasonOpen()`, `activeWorld()`, `activeSeason()`
- `isPlayerInActiveSeason(player)` and `stakedTokenOf(player)`
- `handleOf(player)`
- NFT `balanceOf(player)`. Read `tokenOfOwnerByIndex(player, 0)` only when the wallet is not in the season and the balance is greater than 0

If the season is closed, or `activeWorld()` is not the world above, stop. Tell the owner this season is not open. Sign only with the wallet the owner connected.

## Decide

Follow this order. Take the first match. A wallet already in the season keeps its NFT in the locker, so steps 1–3 still apply when `balanceOf` is 0. Do not stake a second NFT.

1. The wallet is **in the season**, `SpawnPlanet` for that wallet is not zero, and `homeLocations.json` contains the same planet hash: the wallet has a **home**. Read [mining.md](mining.md). The mining center is that planet. Do not spawn a second home and do not move fleets.
2. The wallet is in the season, `SpawnPlanet` is not zero, and `homeLocations.json` does not contain that hash: **stop**. The home is already on chain and its coordinates were not saved. Coordinates are not recoverable from the chain. Do not search for another planet.
3. The wallet is in the season and `SpawnPlanet` is zero: there is **no home**. Read [home.md](home.md). If the player index is zero, ask for a name and wait before registering. Do not invent a name. After the home files exist, ask in that same reply whether to mine and which strategy starts play, as [home.md](home.md) and [mining.md](mining.md) describe. Do not stop after only reporting the coordinates.
4. The wallet is not in the season and `handleOf(player)` is empty: **no Binance handle**. Stop. Do not call `setHandle`, and do not invent a handle.
5. The wallet is not in the season and the NFT balance is 0: **no AIPRO NFT**. Stop. Do not mint, and do not look for a token to buy.
6. The wallet is not in the season, has a handle, and holds an NFT: **stake**.

Before staking, registering, or spawning, if the ETH balance cannot pay for one ordinary transaction, decide **not enough gas** and do not send a transaction. Registering uses the name the owner just gave. Spawning does not need its own yes once a legal home coordinate is known. A search the owner already stopped stays stopped. A home that just got saved is followed by the mining and strategy question, and mining starts only after they answer.

## How to talk

Questions in this skill are examples of which facts to include. Write a new question for the situation in front of you, in the language the owner is using. Do not mention this skill, these files, or that an instruction told you to ask. Do not paste an example when the wallet, the token id, the coordinate, or the next action is different.

Ask one question about the next action, then wait. After the owner agrees and the action succeeds, give the result in one or two sentences and ask the next action. If the owner says no, stop.

Do not ask again for the same wallet and the same action. Ask again when the wallet changes, or when another NFT would be staked. Do not quote that rule to the owner.

## When to ask the owner

Do the work and report it when it does not lock the NFT. Before staking, ask and wait for a yes. If the owner says no, stop. A home search the owner already stopped stays stopped. Once a home has just been saved, the next message asks them to start mining and pick a strategy. Do not treat that question as optional.

Staking is the join. Do not ask a second time after the owner agrees. The question names the wallet, the token id, the small ETH cost, and that the NFT stays in the locker until this season is no longer active.

Example, when this wallet has a handle and an NFT and has not staked:

> Stake AIPRO NFT #1 with this wallet now? It moves into the season locker, costs a little ETH, and cannot be withdrawn while this season is open.

No Binance handle. Do not send a transaction. Tell the owner this wallet has an empty handle, so it cannot stake. Ask whether this is the wallet they mean.

No AIPRO NFT, and not already in the season. Do not send a transaction. Tell the owner this wallet holds none and has not staked, so it cannot join. Ask whether this is the wallet they mean. A wallet already in the season is not this case. Its balance is 0 because the locker holds the NFT, and play continues.

Not enough gas. Do not send a transaction. Tell the owner this wallet needs ETH for gas.

Joined, and a home is saved. If `strategy.txt` is missing or mining has not been started, ask the mining and strategy question from [mining.md](mining.md) and wait. Do not end the turn with only the home coordinates. Do not ask them to confirm the home again.

Joined, but no home yet. If this player is not registered, ask for a name before searching. Follow [home.md](home.md). A search the owner already stopped stays stopped until they say to continue.

## Transactions after confirmation

Sign with the current wallet. A legacy transaction is fine. Do not write a private key into any file, and do not let the page sign. Wait for each receipt before the next step. If a transaction fails, tell the owner the reason and do not retry against a different contract.

Stake:

1. Read `getApproved(tokenId)` on the NFT. If it is not the locker, call NFT `approve(locker, tokenId)`. Approve only this token.
2. Call locker `stake(tokenId)`.

Do not call `withdraw` while `isTokenInGame(tokenId)` is true. The season has to be cleared or moved on before that NFT can come back.

`cast` is one way to do this. `<player>` and the signing account must be the current wallet. `$NFT` and `$LOCKER` are the addresses read above.

```bash
export NO_PROXY=127.0.0.1,localhost
export no_proxy=127.0.0.1,localhost
RPC=http://127.0.0.1:8545

cast send --legacy --rpc-url $RPC $NFT "approve(address,uint256)" $LOCKER <tokenId>
cast send --legacy --rpc-url $RPC $LOCKER "stake(uint256)" <tokenId>
```

## Save

The root is the folder the owner named. The wallet folder contains `agent.json` directly. Tell the owner that folder path, not the season folder above it.

Add two levels under the root:

`<root>/31337-0x3295a33430bb33696b5f04dc12dd91276213100e-<season>/<wallet lowercase>/agent.json`

`agent.json` contains only:

```json
{ "address": "<wallet lowercase>" }
```

`game.json` sits next to it and names this game. Write it when the folder is created, and write it if the folder already exists without it:

```json
{
  "chainId": 31337,
  "world": "0x3295a33430bb33696b5f04dc12dd91276213100e",
  "season": 1
}
```

Use the season from `activeSeason()` and the world from this skill. Do not put a private key in either file.

The map is one file next to those two, named `knownBoard.ndjson`. Each line is one chunk the page draws, and mining keeps that file merged: four aligned chunks become one larger line. Do not write one file per chunk under `knownBoard/`.

When the wallet folder is created, also copy `aggressive.md`, `conservative.md`, `offensive.md`, and `profit.md` from this skill directory into `<wallet>/strategies/`. If that folder already exists, copy only filenames that are missing. Do not overwrite a strategy file that is already there. `strategy.txt` is not written until the owner picks a filename. Playing with that file is [play.md](play.md).

Reuse the file if it already exists. Do not create a second folder. Do not store a private key.

After a successful stake, prepare this folder and tell the owner the full path. Then read [home.md](home.md). Read [mining.md](mining.md) only after the home exists and its coordinates are in `homeLocations.json`. Map mining stays on that path. The next game action after the owner picks a strategy is [play.md](play.md). A preset or a custom strategy file is one prediction per round, then zero or more calls sent in order. A strategy file states a goal and a method. `aggressive.md` expands by taking a higher-level planet. The calls are chosen from [actions.md](actions.md). Score staking, buy silver, and claims use the Nutbox pool in [nutbox.md](nutbox.md). If that pool has no code, stop. Do not deploy one. Every player call, including junk, reveal, artifacts, materials, guilds, and fleet recall, is listed in [actions.md](actions.md). The game rules are [rules.md](rules.md). What a planet's fields and type change is [planets.md](planets.md). What each installed artifact changes is [artifacts.md](artifacts.md). A voyage leaves a planet only when that planet's owner and junk owner are the same wallet.

`homeLocations.json` is a JSON array in the wallet folder. It is absent until the first home is initialized. Do not put a private key in it.

## Report

Use three sentences: which decision was taken, which wallet was used, and the save folder. Do not list contract addresses unless the owner asks.
