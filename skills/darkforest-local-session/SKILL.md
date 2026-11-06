---
name: darkforest-local-session
description: Join the local Dark Forest simulation, initialize a home planet, mine outward from that home, and play with a named strategy file. Use when the owner wants an agent to start this local game, buy a game pass, join the season, spawn a home, mine, or take the next game action.
---

# Local simulation

The owner does not know the chain, contracts, or price. Do not ask for them. The addresses below are this session. Read them from the chain and stop if they do not match. Do not switch chains.

This is a local Anvil simulation, not BNB Chain and not mainnet. State lives in memory and disappears when the process stops. Do not restart the chain. Do not deploy game contracts. Multicall3 is already deployed for this test session. Do not deploy another copy.

| Item            | Value                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| Chain ID        | `31337`                                                                                                  |
| RPC             | `http://127.0.0.1:8545` (`http://localhost:8545` is the same)                                            |
| World           | `0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f`                                                             |
| Game pass       | `0x90c84237fddf091b1e63f369af122eb46000bc70` (DarkForestPunk Pass / DFPASS)                              |
| Test token DFPT | `0x5322471a7E37Ac2B8902cFcba84d266b37D811A0` (18 decimals)                                               |
| Pass price      | `100000` DFPT, that is `100000000000000000000000`                                                        |
| Season          | Read `activeSeason()`. It was `1` at deploy.                                                             |
| Admin           | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`. This account only mints DFPT. It is not the player wallet. |
| Multicall3      | `0xcA11bde05977b3631167028862bE2a173976CA11`. Local test only. If this address has no code, stop.        |

Set both `NO_PROXY=127.0.0.1,localhost` and `no_proxy=127.0.0.1,localhost` before calling the local RPC. If the connection is refused, tell the owner the local chain is not running, then stop.

## Ask first

After reading this skill, ask whether to start. Do not ask where to store the save. Do not ask again in this conversation if the owner already answered.

> Start this local simulation? I will read the connected wallet and then decide whether to buy a pass, join the season, or initialize a home.

If the owner says no, stop. Do not read the chain and do not create a folder.

The save root is fixed:

`/Volumes/Extreme Pro/wangxi/study/mud-study`

Do not move it into `~/Library`, the Desktop, Documents, iCloud, or the `darkforest-punk` repository. The browser cannot open `~/Library`.

## Reads

Every chain read goes through Multicall3 `aggregate3`. Do not send a separate `eth_call` for each value. Set `allowFailure` to false. Do not send ETH to Multicall3, and do not call `aggregate3Value`. If one call fails, stop and tell the owner. Writes stay separate transactions to DFPT, the pass, and the world.

The decision batch is one call:

1. Multicall3 `getEthBalance(player)`
2. DFPT `balanceOf(player)`
3. DFPT `allowance(player, pass)`
4. Pass `balanceOf(player)`
5. Pass `isSeasonOpen()`
6. Pass `activeWorld()`
7. Pass `activeSeason()`
8. Pass `isPlayerInActiveSeason(player)`

Each result is `(bool success, bytes returnData)`. `returnData` is ABI-encoded: a `uint256` or `bool` is one 32-byte word, and an address is the last 20 bytes of that word.

If the pass balance is greater than 0, send a second `aggregate3` with `tokenOfOwnerByIndex(player, i)` for every index from 0 through that balance minus 1. Do not guess token ids.

Home, registration, and the inner circle are a third `aggregate3`. Those three calls are in [home.md](home.md).

```bash
export NO_PROXY=127.0.0.1,localhost
export no_proxy=127.0.0.1,localhost
RPC=http://127.0.0.1:8545
MULTI=0xcA11bde05977b3631167028862bE2a173976CA11
PASS=0x90c84237fddf091b1e63f369af122eb46000bc70
DFPT=0x5322471a7E37Ac2B8902cFcba84d266b37D811A0

ETH=$(cast calldata "getEthBalance(address)" <player>)
BAL=$(cast calldata "balanceOf(address)" <player>)
ALLOW=$(cast calldata "allowance(address,address)" <player> $PASS)
PBAL=$(cast calldata "balanceOf(address)" <player>)
OPEN=$(cast calldata "isSeasonOpen()")
AWORLD=$(cast calldata "activeWorld()")
SEASON=$(cast calldata "activeSeason()")
JOINED=$(cast calldata "isPlayerInActiveSeason(address)" <player>)

cast call $MULTI \
  "aggregate3((address,bool,bytes)[])((bool,bytes)[])" \
  "[($MULTI,false,$ETH),($DFPT,false,$BAL),($DFPT,false,$ALLOW),($PASS,false,$PBAL),($PASS,false,$OPEN),($PASS,false,$AWORLD),($PASS,false,$SEASON),($PASS,false,$JOINED)]" \
  --rpc-url $RPC
```

## Read the connected wallet

Use the wallet the agent is already connected to. Do not ask the owner for the address. Do not switch to the admin account.

Read all of these from the decision batch before deciding:

- Local ETH balance, for gas
- DFPT `balanceOf(player)`
- DFPT `allowance(player, pass)`
- Pass `balanceOf(player)`. When it is greater than 0, list token ids with `tokenOfOwnerByIndex`
- `isSeasonOpen()`, `activeWorld()`, `activeSeason()`
- `isPlayerInActiveSeason(player)`

If the season is closed, or `activeWorld()` is not the world above, stop. Tell the owner this session is not open.

If the connected address is the admin, stop. Tell the owner to switch to the agent wallet. Do not buy a pass with the admin account.

## Decide

Follow this order. Take the first match. Do not buy a second pass.

1. The wallet has **joined**, `SpawnPlanet` for that wallet is not zero, and `homeLocations.json` contains the same planet hash: the wallet has a **home**. Read [mining.md](mining.md). The mining center is that planet. Do not spawn a second home and do not move fleets.
2. The wallet has joined, `SpawnPlanet` is not zero, and `homeLocations.json` does not contain that hash: **stop**. The home is already on chain and its coordinates were not saved. Coordinates are not recoverable from the chain. Do not search for another planet.
3. The wallet has joined and `SpawnPlanet` is zero: there is **no home**. Read [home.md](home.md). Find one legal planet, register, and spawn without asking again. Do not start mining before the home files exist.
4. The wallet holds a pass and has not joined: **join**.
5. The wallet has no pass and its DFPT balance is at least the price: **buy a pass**.
6. The wallet has no pass and its DFPT balance is below the price: **not enough DFPT**. The player cannot buy this token, and must not look for an exchange. The admin has to mint it.

Before joining, buying, registering, or spawning, if the ETH balance cannot pay for one ordinary transaction, decide **not enough gas** and do not send a transaction. Registering and spawning do not need their own yes. After the home files exist, mine the first ring around that home, tell the owner the address and wallet folder in [mining.md](mining.md), and then ask the mining choice.

## How to talk

Questions in this skill are examples of which facts to include. Write a new question for the situation in front of you, in the language the owner is using. Do not mention this skill, these files, or that an instruction told you to ask. Do not paste an example when the wallet, the price, the coordinate, or the next action is different.

Ask one question about the next action, then wait. After the owner agrees and the action succeeds, give the result in one or two sentences and ask the next action. If the owner says no, stop.

Do not ask again for the same wallet and the same action. Ask again when the wallet changes, or when another pass would be bought. Do not quote that rule to the owner.

## When to ask the owner

Do the work and report it when it does not spend tokens and does not bind the pass. Before spending or binding the pass to this season, ask and wait for a yes. If the owner says no, stop. Finding a home, registering the name, and spawning do not wait for another yes. When the home files are written, mine the first ring and tell the owner the address and wallet folder in [mining.md](mining.md). Ask the mining choice only after that ring is written.

Buying a pass already includes joining. Do not ask a second time after the owner agrees. The question names the wallet, the DFPT cost, the small ETH cost, that the pass joins this season immediately, and that it cannot be transferred during the season.

Example, when this wallet has no pass and enough DFPT:

> Buy one pass with this wallet now? It costs 100000 DFPT plus a little ETH, joins this season immediately, and cannot be transferred during the season.

Example, when this wallet already holds a pass and has not joined:

> Join pass #2 to this season now? After joining, it cannot be transferred during the season.

Not enough DFPT. Do not send a transaction. Tell the owner this wallet has less than 100000 DFPT, this token cannot be bought, and the admin has to mint it. Ask whether this is the wallet they mean.

Not enough gas. Do not send a transaction. Tell the owner this wallet needs a little ETH on the local chain.

Joined, and a home is saved. Read [mining.md](mining.md). If the first ring around the home is not on disk yet, mine it and tell the owner the address and wallet folder before asking. If that ring is already written, ask the mining question. That question offers the default and the other mining choices together. After the owner chooses, continue mining. Do not ask them to confirm the home again.

Joined, but no home yet. Do not offer mining. Follow [home.md](home.md) and create the home before asking anything else.

## Transactions after confirmation

Sign with the current wallet. A legacy transaction is fine. Do not write a private key into any file, and do not let the page sign. Wait for each receipt before the next step. If a transaction fails, tell the owner the reason and do not retry against a different contract.

Buy a pass:

1. If `allowance` is below the price, call DFPT `approve(pass, price)`. Approve only this price.
2. Call `buyPass()` on the pass.
3. Read the new token id with `tokenOfOwnerByIndex(player, balanceOf(player) - 1)`.
4. Call `joinSeason(tokenId)` on the pass.

Join only: call `joinSeason(tokenId)` for the token id in the confirmation. If several passes are not joined, use the smallest token id and name that id in the confirmation.

`cast` is one way to do this. `<player>` and the signing account must be the current wallet:

```bash
export NO_PROXY=127.0.0.1,localhost
export no_proxy=127.0.0.1,localhost
RPC=http://127.0.0.1:8545
PASS=0x90c84237fddf091b1e63f369af122eb46000bc70
DFPT=0x5322471a7E37Ac2B8902cFcba84d266b37D811A0
PRICE=100000000000000000000000

cast send --legacy --rpc-url $RPC $DFPT "approve(address,uint256)" $PASS $PRICE
cast send --legacy --rpc-url $RPC $PASS "buyPass()"
cast send --legacy --rpc-url $RPC $PASS "joinSeason(uint256)" <tokenId>
```

## Save

The root is `/Volumes/Extreme Pro/wangxi/study/mud-study`. Do not put the save inside the `darkforest-punk` repository, on the Desktop, in Documents, in iCloud, or under `~/Library`. The wallet folder contains `agent.json` directly. Tell the owner that folder path, not the season folder above it.

Add two levels under the root:

`<root>/31337-0xfdf868ea710ffd8cd33b829c5aff79edd15ecd5f-<season>/<wallet lowercase>/agent.json`

`agent.json` contains only:

```json
{ "address": "<wallet lowercase>" }
```

`game.json` sits next to it and names this session. Write it when the folder is created, and write it if the folder already exists without it:

```json
{
  "chainId": 31337,
  "world": "0xfdf868ea710ffd8cd33b829c5aff79edd15ecd5f",
  "season": 1
}
```

Use the season from `activeSeason()` and the world from this skill. Do not put a private key in either file.

The map is one file next to those two, named `knownBoard.ndjson`. Each line is one chunk the page draws, and mining keeps that file merged: four aligned chunks become one larger line. Do not write one file per chunk under `knownBoard/`.

When the wallet folder is created, also copy `aggressive.md`, `conservative.md`, `offensive.md`, and `profit.md` from this skill directory into `<wallet>/strategies/`. If that folder already exists, copy only filenames that are missing. Do not overwrite a strategy file that is already there. `strategy.txt` is not written until the owner picks a filename. Playing with that file is [play.md](play.md).

Reuse the file if it already exists. Do not create a second folder. Do not store a private key.

After a successful join, prepare this folder and tell the owner the full path. Then read [home.md](home.md). Read [mining.md](mining.md) only after the home exists and its coordinates are in `homeLocations.json`. Map mining stays on that path. The next game action after the owner picks a strategy is [play.md](play.md). A preset or a custom strategy file is one prediction per round, then zero or more calls sent in order. A strategy file states a goal and a method. `aggressive.md` expands by taking a higher-level planet. The calls are chosen from [actions.md](actions.md). Score staking, buy silver, and claims use the Nutbox pool in [nutbox.md](nutbox.md). If that pool has no code, attach it from that file before a withdraw. Every player call, including junk, reveal, artifacts, materials, guilds, and fleet recall, is listed in [actions.md](actions.md). The game rules are [rules.md](rules.md). What a planet's fields and type change is [planets.md](planets.md). What each installed artifact changes is [artifacts.md](artifacts.md). A voyage leaves a planet only when that planet's owner and junk owner are the same wallet.

`homeLocations.json` is a JSON array in the wallet folder. It is absent until the first home is initialized. Do not put a private key in it.

## Report

Use three sentences: which decision was taken, which wallet was used, and the save folder. Do not list contract addresses unless the owner asks.
