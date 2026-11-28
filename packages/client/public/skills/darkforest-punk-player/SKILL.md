---
name: darkforest-punk-player
version: 1.1.3
description: Join Dark Forest on BSC (chain 56), stake a game-pass NFT, spawn a home, explore, and play with a named strategy file. When speaking to the owner, call map hashing 探索. Every explore program must merge knownBoard chunks as they grow. Use when the owner wants an agent to start playing, stake the game-pass NFT, spawn a home, explore, take the next game action, or pastes a block that starts with DARKFOREST_MOVE, DARKFOREST_REVERT_MOVE, DARKFOREST_WITHDRAW_MATERIAL, DARKFOREST_WITHDRAW_SILVER, DARKFOREST_BUY_SILVER, DARKFOREST_UPGRADE, DARKFOREST_ADD_JUNK, DARKFOREST_BUY_JUNK, DARKFOREST_FIND_ARTIFACT, DARKFOREST_USE_ARTIFACT, DARKFOREST_CLEAR_JUNK, DARKFOREST_CLAIM_REWARDS, or DARKFOREST_CLAIM_COMMUNITY.
---

# Dark Forest player

The owner does not know the chain, contracts, or price. Do not ask for them. The addresses below are the contracts for this game. Read them from the chain and stop if they do not match. Do not switch chains. Do not deploy contracts. If Multicall3 or the World has no code, stop.

| Item            | Value                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Chain ID        | `56` (BNB Smart Chain)                                                                                                   |
| RPC             | `https://bsc.publicnode.com`                                                                                             |
| World           | `0xfaD1cDDAD97113e4c0335FF5A815955c21b2ddca`                                                                             |
| Game pass NFT   | `0xD0ac6355Deb37711fBf365838c755D2BC44EB32A`                                                                             |
| Handle registry | `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F` (Binance / Space ID)                                                        |
| Locker          | `0xe8d9F091d0650EdcB5237b2D4BB5b654783B61d6`                                                                             |
| Entry           | One game-pass NFT in the locker. `isPlayerInActiveSeason(player)` is true while it is there. Stake and withdraw anytime. |
| Multicall3      | `0xcA11bde05977b3631167028862bE2a173976CA11`. If this address has no code, stop.                                         |
| Player          | The wallet the owner connected for this run. Do not write that address into this skill.                                  |
| Game page       | `https://starlinkdf.tagai.fun/redpill/0xfaD1cDDAD97113e4c0335FF5A815955c21b2ddca`                                        |

This is the live BSC deployment. Keep these addresses. Do not switch chains. Do not deploy contracts. The Nutbox bindings and purchase checks are in [nutbox.md](nutbox.md).

This map uses planet hash key `20261119`, space key `20261120`, biome key `20261121`, and scale `8192`. At the start of a run, verify the World, locker, NFT, handle registry, and pool on chain before opening a wallet save. A matching folder name does not prove that its files belong to this map. If `SpawnPlanet` for this wallet is zero and the folder already contains `homeLocations.json` or `knownBoard.ndjson`, stop and ask the owner for an empty directory. Do not use those files. Create fresh files only after the current chain and wallet state have been read. Keep stopped mining and strategy processes stopped until the owner explicitly starts them for this run. Any 探索 code path — default or custom — must merge `knownBoard.ndjson` as [mining.md](mining.md) requires; do not ship an explorer that only appends unmerged side-16 lines.

After an agent restart, treat any earlier chain snapshot, transaction receipt, staked NFT, registered name, home, and in-memory signer as unverified. Pin a fresh block and read the current `GamePassNFT` World record through the verified Multicall3; check the locker, NFT, handle registry, and pool against the current deployment before making a game decision. Derive the player address from a signer that is **still live**, then read `isPlayerInActiveSeason(player)` and `SpawnPlanet` from this deployment. A socket path or a saved address by itself does not prove that its old signer process survived the restart. Do not resume an old transaction plan or copy another map's board or action log into this save. The current chain state decides what is live.

Use the World from `packages/contracts/worlds.json` for chain `56`, and verify its code before using it. Read the locker from the World table and the NFT and handle registry from that locker. If `isPlayerInActiveSeason(player)` is false and the wallet holds an NFT, approve that NFT to the locker, then call `stake` on the locker. Stake transfers that NFT into the locker, so a staked wallet has an NFT balance of 0 and still plays. A wallet with a handle and no NFT acquires one from the NFT contract first (read mint price on chain; do not invent it). Do not call `setHandle`. Stop if any required address has no code.

If the RPC cannot be reached, stop. Prefer a stable BSC HTTP RPC when publicnode rate-limits.

## Pasted orders

Every pasted order below is recorded after its receipt as [actions.md](actions.md) describes under Recording a pasted order. The line has no `strategy` key. `detail` carries the parameters the block carried, in display units and with planet coordinates, so the owner can read what was sent.

## Pasted fleet

The game page does not send a fleet when the owner drags from one planet to another. It copies a block. The first line is `DARKFOREST_MOVE`. The next line is one JSON object with `"kind": "darkforest-move"`.

That JSON is the whole move. The moment it is recognized, prove and send it in this turn. Do not wait for another message. Do not ask to start, do not ask which planet, and do not ask how much energy or silver to send. `population` is the energy for this departure, and `silver` is the silver. Both are already chain units. Do not multiply them by 1000 again. Do not mine, do not open the map to choose a source or a destination, and do not run a strategy round before this send. Do not change `population`, `silver`, `artifactId`, `materials`, or any field inside `circuit`.

Prove from `packages/client`, with `packages/client/public/snarkjs.min.js`, `packages/client/src/Shared/snarks/move.wasm`, and `packages/client/src/Shared/snarks/move.zkey`. Pass `circuit` to `groth16.fullProve` as the input. Every value in `circuit` is already a string. Do not recompute coordinates, `distMax`, or `targetDistFromOriginSquare`.

Turn the snarkjs proof into the World proof before sending:

- `A` is `[pi_a[0], pi_a[1]]`. Drop `pi_a[2]`.
- `B` is `[[pi_b[0][1], pi_b[0][0]], [pi_b[1][1], pi_b[1][0]]]`. Reverse each inner pair. Drop `pi_b[2]`.
- `C` is `[pi_c[0], pi_c[1]]`. Drop `pi_c[2]`.
- The MoveInput is the 11 `publicSignals` in the order the prover returned them. Do not sort or rebuild that array.

The first public signal must equal `fromHash`. The second must equal `toHash`. Both are decimal planet hashes. If either differs, stop and do not send.

Call World `df__move` with that proof, that MoveInput, `population`, `silver`, `artifactId`, and `materials`. `materials` is the pasted array of `{ resourceId, amount }`. Each `amount` is already chain units. An empty array sends no materials. When `artifactId` is not `0`, that artifact travels with this fleet. Do not clear it. Attach `entryFeeWei` wei as the transaction value. Sign with the player wallet. Wait for a successful receipt. Then record `move` as [actions.md](actions.md) describes, with `to` set to `toHashHex`: 64 lowercase hex characters and no `0x` prefix. If the proof fails or the receipt reverts, tell the owner and do not write `actions.ndjson`.

## Pasted fleet recall

The game page does not recall a fleet. On an in-flight fleet it copies a block. The first line is `DARKFOREST_REVERT_MOVE`. The next line is one JSON object with `"kind": "darkforest-revert-move"`.

That JSON is the whole recall. The moment it is recognized, send it in this turn. Do not wait for another message. Do not ask to start, and do not ask which fleet. There is no proof. Call World `df__revertMove` with `moveId` and `toPlanetHash`. `toPlanetHash` is the destination the fleet is flying toward, as a decimal planet hash. Attach `entryFeeWei` wei. Sign with the player wallet. Wait for a successful receipt. Then record `revert-move` as [actions.md](actions.md) describes, with `to` set to the source the fleet is now returning to. If the receipt reverts, tell the owner and do not write `actions.ndjson`.

## Pasted material score

The game page does not withdraw material. On a spacetime rip it copies a block. The first line is `DARKFOREST_WITHDRAW_MATERIAL`. The next line is one JSON object with `"kind": "darkforest-withdraw-material"`.

That JSON is the whole withdrawal. The moment it is recognized, send it in this turn. Do not wait for another message. Do not ask to start, do not ask which planet, and do not ask which material or how much to withdraw. `amount` is already chain units. Do not multiply it by 1000. Do not mine, do not open the map, and do not run a strategy round before this send. Do not change `planetHash`, `materialType`, or `amount`.

Call World `df__withdrawMaterial` with `planetHash`, `materialType`, and `amount`. There is no proof. Attach `entryFeeWei` wei as the transaction value. Sign with the player wallet. Wait for a successful receipt. Then record `withdraw-material` as [actions.md](actions.md) describes. If the receipt reverts, tell the owner and do not write `actions.ndjson`.

## Pasted silver score

The game page does not withdraw silver. On a spacetime rip it copies a block. The first line is `DARKFOREST_WITHDRAW_SILVER`. The next line is one JSON object with `"kind": "darkforest-withdraw-silver"`.

That JSON is the whole withdrawal. The moment it is recognized, send it in this turn. Do not wait for another message. Do not ask to start, do not ask which planet, and do not ask how much silver to withdraw. `amount` is already chain units. Do not multiply it by 1000. Do not mine, do not open the map, and do not run a strategy round before this send. Do not change `planetHash` or `amount`. A silver mine cannot take this call. The pasted `planetHash` is the spacetime rip.

Call World `df__withdrawSilver` with `planetHash` and `amount`. There is no proof. Attach `entryFeeWei` wei as the transaction value. Sign with the player wallet. Wait for a successful receipt. Then record `withdraw-silver` as [actions.md](actions.md) describes. If the receipt reverts, tell the owner and do not write `actions.ndjson`.

## Pasted silver purchase

The game page copies a `DARKFOREST_BUY_SILVER` line followed by one JSON object with `"kind": "darkforest-buy-silver"` and `"call": "df__buySilver"`. The order records `chainId`, `worldAddress`, `planetHash`, `planetHashHex`, `tier`, `paymentToken`, `buySilverSystem`, `priceWei`, `priceWhole`, `silverDisplay`, and `entryFeeWei`. Treat these as the owner's proposed order, pending verification.

The AIPRO spender for silver purchases in BSC round 1 is `0x43e4CF86Bc12D46dEb64ca3836A5aEb11E4566df`.

Before signing an approval or purchase, save the pasted block to a temporary order file and run `node check-buy-silver.mjs --player <active signer address> --signer-chain-id <verified live wallet chain ID> --order-file <path>` from this skill bundle. Follow the purchase preflight in [nutbox.md](nutbox.md#verify-a-buy-before-signing). Verify the active wallet and RPC chain and compare the order's chain and World with the independent BSC deployment in this skill. On a single pinned Multicall3 snapshot, compare the token from `DFXStarConfig`, the actual registered spender from the World `Systems` table, that spender's `trustedWorld()`, and the live quote and World fee with the order. If a required field, deployment binding, quote, or read is missing or mismatched, stop before either transaction and tell the owner why. For a stale or incomplete clipboard order, ask the owner to copy a fresh one.

Use only the verified addresses and amounts from that preflight. If the verified allowance is insufficient, approve `paymentToken` to the verified `buySilverSystem` for exactly the verified `priceWei` and wait for a successful approval receipt. Re-run the helper after that receipt against one newly pinned block and confirm the allowance before signing the purchase. If the check still passes, call the verified World `df__buySilver(planetHash, tier)` with the verified entry fee, using the same player wallet. When all checks pass, continue with the selected tier in this turn.

Wait for a successful purchase receipt, then record the verified `priceWhole` in `spends.ndjson` and record `buy-silver` as [actions.md](actions.md) describes. If either transaction fails or the second preflight blocks the purchase, report the reason and any allowance granted by this order. Only a successful purchase creates a spend or action record.

## Pasted upgrade

The game page does not upgrade a planet. On an owned planet it copies a block. The first line is `DARKFOREST_UPGRADE`. The next line is one JSON object with `"kind": "darkforest-upgrade"`.

That JSON is the whole upgrade. The moment it is recognized, send it in this turn. Do not wait for another message. Do not ask to start, do not ask which planet, and do not ask which stat. Do not change `planetHash`, `rangeTimes`, `speedTimes`, or `defenseTimes`. Those three counts are the extra levels for this call, not the new totals. There is no proof.

Call World `df__upgradePlanet` with `planetHash`, `rangeTimes`, `speedTimes`, and `defenseTimes`. Attach `entryFeeWei` wei. Sign with the player wallet. Wait for a successful receipt. Then record `upgrade` as [actions.md](actions.md) describes. If the receipt reverts, tell the owner and do not write `actions.ndjson`.

## Pasted junk registration

The game page does not register junk. On a planet this wallet owns, it copies a block. The first line is `DARKFOREST_ADD_JUNK`. The next line is one JSON object with `"kind": "darkforest-add-junk"`.

That JSON is the whole registration. The moment it is recognized, prove and send it in this turn. Do not wait for another message. Do not ask to start, and do not ask which planet. Do not change `planetHash`, `biomebase`, or any field inside `circuit`. Do not mine and do not open the map.

Prove from `packages/client`, with `packages/client/public/snarkjs.min.js`, `packages/client/src/Shared/snarks/biomebase.wasm`, and `packages/client/src/Shared/snarks/biomebase.zkey`. Pass `circuit` to `groth16.fullProve` as the input. Turn the snarkjs proof into the World proof the same way Pasted fleet describes. This proof has 7 public signals, in the order the prover returned them. The first must equal `planetHash`. The second must equal `biomebase`. If either differs, stop and do not send.

Call World `df__addJunk` with `planetHash`, `biomebase`, and that proof. Attach `entryFeeWei` wei. Sign with the player wallet. Wait for a successful receipt. Then record `add-junk` as [actions.md](actions.md) describes. If the proof fails or the receipt reverts, tell the owner and do not write `actions.ndjson`.

## Pasted artifact

The game page does not prospect or find an artifact. On a foundry this wallet owns and has registered, it copies a block. The first line is `DARKFOREST_FIND_ARTIFACT`. The next line is one JSON object with `"kind": "darkforest-find-artifact"`.

That JSON is the whole artifact. The moment it is recognized, send it in this turn. Do not wait for another message. Do not ask to start, and do not ask which foundry. Do not change `planetHash`, `biomebase`, `phase`, or any field inside `circuit`. Do not mine and do not open the map.

`phase` is `prospect-then-find` or `find`. When it is `prospect-then-find`, call World `df__prospectPlanet` with `planetHash`. Attach `entryFeeWei` wei. Sign with the player wallet and wait for that receipt. If it reverts because this foundry is already inside its 256-block window, continue to the find. If it reverts for any other reason, tell the owner and do not write `actions.ndjson`. If it succeeds, continue in this same turn. Do not wait for another message between the two calls. When `phase` is `find`, do not call `df__prospectPlanet`.

Prove from `packages/client`, with the same `biomebase.wasm` and `biomebase.zkey` as Pasted junk registration. Pass `circuit` to `groth16.fullProve`. Turn the snarkjs proof into the World proof the same way Pasted fleet describes. This proof has 7 public signals, in the order the prover returned them. The first must equal `planetHash`. The second must equal `biomebase`. If either differs, stop and do not send the find. If prospect already succeeded, record `prospect` and do not record `find-artifact`.

Call World `df__findingArtifact` with that proof and the BiomebaseInput of those 7 signals, in prover order: planetHash, biomebase, mimcHashKey, biomebaseKey, perlinLengthScale, perlinMirrorX, perlinMirrorY. Attach `entryFeeWei` wei. Wait for a successful receipt. Record `prospect` when this order's prospect receipt succeeded, then record `find-artifact`, as [actions.md](actions.md) describes. If the find receipt reverts, tell the owner. Record `prospect` only when that receipt succeeded, and do not record `find-artifact`.

## Pasted artifact use

The game page does not charge, activate, shut down, or land an artifact. On an artifact this wallet owns, it copies a block. The first line is `DARKFOREST_USE_ARTIFACT`. The next line is one JSON object with `"kind": "darkforest-use-artifact"`.

That JSON is the whole use. The moment it is recognized, send it in this turn. Do not wait for another message. Do not ask to start, and do not ask which artifact. Do not change `action`, `planetHash`, `artifactId`, `dataKind`, `targetHash`, `revealPlanetHash`, or any field inside `circuit`. Do not mine and do not open the map.

`action` is `charge`, `activate`, `shutdown`, or `land`. `call` names the function. `valueWei` is the transaction value. Charge, activate, and shutdown call the World function in `call` with `planetHash`, `artifactId`, and the bytes described below. Attach `valueWei`. Shutdown takes no bytes. Land is not a `df__` call. Read the world ABI and call `destroy` on namespace `atf.1`, system `ProxySystem`, as [actions.md](actions.md) describes under Land a pink bomb. Pass `artifactId` as the bomb id, then the proof and the reveal input as two arguments. Attach `valueWei`, which is 0. Do not invent a `df__` name. The bomb may already have left the planet. Still send the land call.

When `dataKind` is `empty`, the bytes argument is `0x`.

When `dataKind` is `wormhole`, the bytes argument is `abi.encode` of one `bytes32`. That value is `targetHash`. `targetHashHex` is the same value as 64 hex characters without `0x`.

When `dataKind` is `reveal`, prove from `packages/client`, with `packages/client/public/snarkjs.min.js`, `packages/client/src/Shared/snarks/reveal.wasm`, and `packages/client/src/Shared/snarks/reveal.zkey`. Pass `circuit` to `groth16.fullProve`. Turn the snarkjs proof into the World proof the same way Pasted fleet describes. This proof has 9 public signals, in the order the prover returned them. The first must equal `revealPlanetHash`. If it differs, stop and do not send. Fill a RevealInput from those 9 signals, in prover order: planetHash, perlin, x, y, mimcHashKey, spaceTypeKey, perlinLengthScale, perlinMirrorX, perlinMirrorY. For charge and activate, the bytes argument is `abi.encode` of the proof and that RevealInput. For land, pass them as the two arguments after the bomb id.

Wait for a successful receipt. Record `charge-artifact`, `activate-artifact`, `shutdown-artifact`, or `land-bomb`, matching `action`, as [actions.md](actions.md) describes. If the receipt reverts, tell the owner and do not write `actions.ndjson`.

## Pasted junk clear

The game page does not clear junk. It copies a block. The first line is `DARKFOREST_CLEAR_JUNK`. The next line is one JSON object with `"kind": "darkforest-clear-junk"`.

That JSON is the whole clear. The moment it is recognized, send it in this turn. Do not wait for another message. Do not ask to start, and do not ask which planet. Do not change `planetHash`. There is no proof. Call World `df__clearJunk` with `planetHash`. Attach `entryFeeWei` wei. Sign with the player wallet. Wait for a successful receipt. Then record `clear-junk` as [actions.md](actions.md) describes. When `ownsPlanet` is true, the planet was abandoned. If the receipt reverts, tell the owner and do not write `actions.ndjson`.

A message can contain more than one of these blocks. Send every fleet first, then every fleet recall, then every junk purchase, then every junk registration, then every artifact find, then every artifact use, then every silver withdrawal, then every material withdrawal, then every silver purchase, then every upgrade, then every junk clear, then every game-reward claim, then every community-reward claim, all in this turn. Every silver purchase in the message needs its own verification before approval.

## Pasted junk purchase

The game page does not buy junk limit. Beside 垃圾额度, the 购买 button opens a price list, and each tier's button copies a block. The first line is `DARKFOREST_BUY_JUNK`. The next line is one JSON object with `"kind": "darkforest-buy-junk"`.

That JSON is the whole purchase. The owner already picked the tier and saw its price, so do not ask again. The moment it is recognized, send it in this turn. Do not wait for another message. Do not ask to start. There is no proof and no entry fee. Call World `df__buyJunk` with `allocation`. Attach `valueWei` wei as the transaction value. Sign with the player wallet. Wait for a successful receipt. Then record `buy-junk` as [actions.md](actions.md) describes. If the receipt reverts, tell the owner. The price on chain may have changed since the page computed it. Do not write `actions.ndjson`.

## Pasted game reward claim

The game page does not claim rewards. Under the score, the line labeled 游戏奖励 copies a block. The first line is `DARKFOREST_CLAIM_REWARDS`. The next line is one JSON object with `"kind": "darkforest-claim-rewards"`.

When the owner clicks the button, the page reads the trusted World's `DFXStarConfig`, the pending game reward, the Committee's `getPoolOperationFee`, and the wallet's `getFeeFree` status through Multicall at one block. The order records the resulting `pool`, `pendingWei`, `valueWei`, `chainId`, `worldAddress`, and `account`.

For an order copied from the game page, match `chainId` and `worldAddress` to the current game and `account` to the player wallet. If they differ, ask for a fresh copy from the matching game and wallet. A legacy order with all three context fields absent may use the current game and player wallet when it explicitly quotes `valueWei` as `0`. Ask for a fresh copy if a newer order has incomplete context.

If `pendingWei` is positive and the context matches, call `claimExternalRewards()` on `pool` with exactly `valueWei` wei. Sign with the matching player wallet, wait for a successful receipt, and record `claim` as [actions.md](actions.md) describes. If the transaction reverts, tell the owner and leave the action history as it was.

## Pasted community reward claim

The line labeled 社区奖励 copies a different block. The first line is `DARKFOREST_CLAIM_COMMUNITY`. The next line is one JSON object with `"kind": "darkforest-claim-community"`.

At copy time the page resolves `community` and `pool` from the trusted World and reads the pending community reward and the Committee's `getPoolOperationFee` through Multicall at one block. The order includes both addresses along with `pendingWei`, `valueWei`, `chainId`, `worldAddress`, and `account`.

Apply the copied-order context checks and legacy-order rule in [Pasted game reward claim](#pasted-game-reward-claim). If `pendingWei` is positive and the context matches, call `withdrawPoolsRewards` on `community` with `[pool]` and attach exactly `valueWei` wei. Sign with the matching player wallet, wait for a successful receipt, and record `claim-community` as [actions.md](actions.md) describes. If the transaction reverts, tell the owner and leave the action history as it was.

## Ask first

After reading this skill, ask whether to start. Do not ask again in this conversation if the owner already answered. A message that contains `DARKFOREST_MOVE`, `DARKFOREST_REVERT_MOVE`, `DARKFOREST_WITHDRAW_MATERIAL`, `DARKFOREST_WITHDRAW_SILVER`, `DARKFOREST_BUY_SILVER`, `DARKFOREST_UPGRADE`, `DARKFOREST_ADD_JUNK`, `DARKFOREST_BUY_JUNK`, `DARKFOREST_FIND_ARTIFACT`, `DARKFOREST_USE_ARTIFACT`, `DARKFOREST_CLEAR_JUNK`, `DARKFOREST_CLAIM_REWARDS`, or `DARKFOREST_CLAIM_COMMUNITY` is an order, not a new start. Send each order as its pasted section describes, and do not ask this question.

> Start playing Dark Forest? I will read the connected wallet and then decide whether to stake an AIPRO NFT, or initialize a home.

If the owner says no, stop. Do not read the chain and do not create a folder.

The owner chooses a root folder for this agent. Each agent has its own root. If they have not chosen one, ask once and wait. Reuse that root. Inside it, create one game folder named `<chainId>-<world>` and, inside that, one wallet folder named with the lowercase player address. Create these subfolders only inside the owner's root, and do not use another agent's root. Do not put the save inside this repository, on the Desktop, in Documents, in iCloud, or under `~/Library`. The browser cannot open `~/Library`.

## Reads

Every chain read goes through Multicall3 `aggregate3`. Do not send a separate `eth_call` for each value. Set `allowFailure` to false. Do not send BNB to Multicall3, and do not call `aggregate3Value`. If one call fails, stop and tell the owner. Writes stay separate transactions to the AIPRO NFT, the locker, and the world. Do not call a DFPT token or `buyPass`.

The locker address is not fixed. Read it from the world table `GamePassNFT`, then read the NFT and the handle registry from that locker.

| Table       | Id                                                                   |
| ----------- | -------------------------------------------------------------------- |
| GamePassNFT | `0x7462646600000000000000000000000047616d65506173734e46540000000000` |

The first batch is the BNB balance and that table. The table key is empty. Its static data is one address, 20 bytes packed from the left. That address is the locker. An empty record, or an address of zero, means this world has no locker. Stop and tell the owner. Do not register and do not look for a pass to buy.

```bash
RPC=https://bsc.publicnode.com
MULTI=0xcA11bde05977b3631167028862bE2a173976CA11
WORLD=0xfaD1cDDAD97113e4c0335FF5A815955c21b2ddca

ETH=$(cast calldata "getEthBalance(address)" <player>)
LOCKER_REC=$(cast calldata "getRecord(bytes32,bytes32[])" 0x7462646600000000000000000000000047616d65506173734e46540000000000 "[]")

cast call $MULTI \
  "aggregate3((address,bool,bytes)[])((bool,bytes)[])" \
  "[($MULTI,false,$ETH),($WORLD,false,$LOCKER_REC)]" \
  --rpc-url $RPC
```

The second batch uses the locker from that read. `nft()` and `handleRegistry()` are the contracts for the steps below. Do not reuse an address from an older session.

1. Locker `isPlayerInActiveSeason(player)`
2. Locker `stakedTokenOf(player)`
3. Locker `nft()`
4. Locker `handleRegistry()`
5. Handle registry `handleOf(player)`
6. NFT `balanceOf(player)`

Each result is `(bool success, bytes returnData)`. `returnData` is ABI-encoded: a `uint256` or `bool` is one 32-byte word, an address is the last 20 bytes of that word, and a string is a dynamic ABI string.

`isPlayerInActiveSeason(player)` is whether this wallet's NFT is in the locker. Every state-changing player call checks that. Stake moves the NFT into the locker, so a staked wallet has `balanceOf` 0. That 0 is expected. Do not treat it as a missing NFT, and do not call `tokenOfOwnerByIndex` on that wallet. Its token id is `stakedTokenOf(player)`. The locker holds the token.

Only when `isPlayerInActiveSeason(player)` is false and `balanceOf(player)` is greater than 0, send another `aggregate3` with `tokenOfOwnerByIndex(player, 0)`. That token is the one to stake. Do not guess token ids, and do not stake a second one. One wallet stakes one NFT. The owner can withdraw it at any time. After withdrawal, state-changing player calls revert. Planets, score, and pool stake stay. Staking again restores play. Claiming pool rewards does not require the NFT to be in the locker. Fleets already sent still arrive.

Home, registration, and the inner circle are the batch in [home.md](home.md).

## Read the connected wallet

The player is the wallet the owner connected for this run. Before any signed call, derive the address from that signer and require an exact match. Never put the key or the address into this skill, a game save, a script, a tool argument, or the macOS Keychain. If the runtime signer is gone, stop signed actions and ask the owner to connect the wallet again. Do not switch to another account.

Each wallet has its own NFT, handle, registration, balances, home, and save folder. Read those on chain before acting. Do not copy another wallet's files, spending authorization, or transaction log. A one-off request to start this wallet does not restart a stopped mining process or paused strategy automation.

Read all of these before deciding:

- BNB balance, for gas
- The locker address from `GamePassNFT`
- `isPlayerInActiveSeason(player)` and `stakedTokenOf(player)`
- `handleOf(player)`
- NFT `balanceOf(player)`. Read `tokenOfOwnerByIndex(player, 0)` only when the wallet is not staked and the balance is greater than 0

Sign only with the wallet the owner connected.

## Decide

Follow this order. Take the first match. A staked wallet keeps its NFT in the locker, so steps 1–3 still apply when `balanceOf` is 0. Do not stake a second NFT.

1. The wallet is **staked**, `SpawnPlanet` for that wallet is not zero, and `homeLocations.json` contains the same planet hash: the wallet has a **home**. Read [mining.md](mining.md). The mining center is that planet. Do not spawn a second home and do not move fleets.
2. The wallet is staked, `SpawnPlanet` is not zero, and `homeLocations.json` does not contain that hash: **stop**. The home is already on chain and its coordinates were not saved. Coordinates are not recoverable from the chain. Do not search for another planet.
3. The wallet is staked and `SpawnPlanet` is zero: there is **no home**. Read [home.md](home.md). If the player index is zero, register with this wallet's Binance / Space ID handle; do not ask for a name. After the home files exist, ask in that same reply whether to start 探索 and which strategy starts play, as [home.md](home.md) and [mining.md](mining.md) describe. Do not stop after only reporting the coordinates.
4. The wallet is not staked and `handleOf(player)` is empty: **no Binance handle**. Stop. Do not call `setHandle`, and do not invent a handle.
5. The wallet is not staked, has a handle, and the NFT balance is 0: **paid mint**. Ask before spending. Then stake the minted token.
6. The wallet is not staked, has a handle, and holds an NFT: **stake**.

Before staking, registering, or spawning, if the BNB balance cannot pay for one ordinary transaction, decide **not enough gas** and do not send a transaction. Registering uses the wallet's Binance / Space ID handle from `handleOf(player)`. Spawning does not need its own yes once a legal home coordinate is known. A search the owner already stopped stays stopped. A home that just got saved is followed by the 探索 and strategy question, and the run starts only after they answer.

## How to talk

Questions in this skill are examples of which facts to include. Write a new question for the situation in front of you, in the language the owner is using. When the question is about hashing the map from the home, the action is 探索. Do not say 挖矿 or mining in the sentence the owner reads. Do not mention this skill, these files, or that an instruction told you to ask. Do not paste an example when the wallet, the token id, the coordinate, or the next action is different.

Ask one question about the next action, then wait. After the owner agrees and the action succeeds, give the result in one or two sentences and ask the next action. If the owner says no, stop.

Do not ask again for the same wallet and the same action. Ask again when the wallet changes, or when another NFT would be staked. Do not quote that rule to the owner.

## When to ask the owner

Do the work and report it when it does not lock the NFT. Before staking, ask and wait for a yes. If the owner says no, stop. A home search the owner already stopped stays stopped. Once a home has just been saved, the next message asks them to start 探索 and pick a strategy. Do not say 挖矿 or mining in that question. Do not treat that question as optional.

Staking is the join. Do not ask a second time after the owner agrees. The question names the wallet, the token id, the small BNB cost, and that the NFT can be withdrawn later. While it is out, this wallet cannot take game actions.

Example, when this wallet has a handle and an NFT and has not staked:

> Stake AIPRO NFT #1 with this wallet now? It moves into the locker and costs a little BNB. You can withdraw it later. While it is out, this wallet cannot take game actions.

No Binance handle. Do not send a transaction. Tell the owner this wallet has an empty handle, so it cannot stake. Ask whether this is the wallet they mean.

No AIPRO NFT, and not already staked. Ask before minting. The question names the wallet, the AIPRO price, and the native fee.

> Mint an AIPRO NFT with this wallet now? It costs 100000 AIPRO and 0.01 BNB. The NFT stays in this wallet until it is staked.

A staked wallet is not this case. Its balance is 0 because the locker holds the NFT, and play continues. If the owner says no, stop.

Not enough gas. Do not send a transaction. Tell the owner this wallet needs BNB for gas.

Joined, and a home is saved. If `strategy.txt` is missing or the map run has not been started, ask the 探索 and strategy question from [mining.md](mining.md) and wait. The sentence the owner reads uses 探索. Do not end the turn with only the home coordinates. Do not ask them to confirm the home again.

Joined, but no home yet. If this player is not registered, register with the wallet handle before searching; do not ask for a name. Follow [home.md](home.md). A search the owner already stopped stays stopped until they say to continue.

## Transactions after confirmation

Sign with the current wallet. A legacy transaction is fine. Do not write a private key into any file, and do not let the page sign. Wait for each receipt before the next step. If a transaction fails, tell the owner the reason and do not retry against a different contract.

Paid mint, only after the owner says yes:

1. Read mint pricing on the NFT contract on chain (`communityTokenPrice` / `nativePrice`, or the live mint entrypoints this collection exposes). Do not invent prices from an older local deploy.
2. Read the payment-token balance. The payment token is `paymentToken` in `DFXStarConfig`, the address in [nutbox.md](nutbox.md). Stop if the token or BNB balance cannot cover mint plus gas. Tell the owner which one is short. Do not mint from another wallet.
3. If the mint pulls the payment token, read `allowance(player, NFT)` and approve the NFT for the on-chain price when needed. Approve the NFT contract, not the locker and not the World.
4. Call the NFT mint entrypoint with the value and args the contract requires. The wallet must already have a Binance handle. Do not call `setHandle`.

Stake:

1. Read `getApproved(tokenId)` on the NFT. If it is not the locker, call NFT `approve(locker, tokenId)`. Approve only this token.
2. Call locker `stake(tokenId)`.

The owner can take the NFT back at any time. Ask first. Call locker `withdraw(tokenId)` with `stakedTokenOf(player)`. After it returns, do not send game actions until the owner stakes again. Planets, score, and pool stake stay.

`cast` is one way to do this. `<player>` and the signing account must be the current wallet. `$NFT` and `$LOCKER` are the addresses read above.

```bash
RPC=https://bsc.publicnode.com

# Mint only after reading this collection's live price and mint ABI on chain.
# Then stake:
cast send --rpc-url $RPC $NFT "approve(address,uint256)" $LOCKER <tokenId>
cast send --rpc-url $RPC $LOCKER "stake(uint256)" <tokenId>
```

## Save

The wallet folder is `<root>/<chainId>-<world>/<player lowercase>/`. `agent.json` is directly inside it. Tell the owner that wallet folder's full path. On the page, `打开钱包目录` selects this wallet folder, not the root.

`agent.json` contains only:

```json
{ "address": "<player lowercase>" }
```

`<player>` is the wallet connected for this run. Write it in `agent.json` only. Do not write it into this skill.

`game.json` sits next to it and names the game. Write it when the folder is created, and write it if the folder already exists without it:

```json
{
  "chainId": 56,
  "world": "<world lowercase>"
}
```

`<world>` is the World in the table above. These two fields tell the page which game the folder belongs to. Do not put a private key in either file.

The map is one file next to those two, named `knownBoard.ndjson`. Each line is one chunk the page draws. **Merging that file is mandatory for every 探索 program**, including one the owner or agent rewrote from scratch. Appending side-16 lines alone is not enough: when chunks pile up, four aligned siblings must fold into larger lines, and a stop (or a long run) must rewrite the merged map. Skipping merge leaves a huge log, slows the page, and re-hashes covered squares. The fold rules and the safer write path are in [mining.md](mining.md) under **Merging chunks (required)**. Do not write one file per chunk under `knownBoard/`.

When the wallet folder is created, also copy `aggressive.md`, `conservative.md`, `offensive.md`, and `profit.md` from this skill directory into `<wallet>/strategies/`. If that folder already exists, copy only filenames that are missing. Do not overwrite a strategy file that is already there. `strategy.txt` is not written until the owner picks a filename. Playing with that file is [play.md](play.md).

Reuse the file if it already exists. Do not create a second folder. Do not store a private key.

After a successful stake, prepare this folder and tell the owner the full path. Then read [home.md](home.md). Read [mining.md](mining.md) only after the home exists and its coordinates are in `homeLocations.json`. Map mining stays on that path. The next game action after the owner picks a strategy is [play.md](play.md). A preset or a custom strategy file is one prediction per round, then zero or more calls sent in order. A strategy file states a goal and a method. `aggressive.md` expands by taking a higher-level planet. The calls are chosen from [actions.md](actions.md). Score staking, buy silver, and claims use the Nutbox pool in [nutbox.md](nutbox.md). If that pool has no code, stop. Do not deploy one. Every player call, including junk, reveal, artifacts, materials, guilds, and fleet recall, is listed in [actions.md](actions.md). The game rules are [rules.md](rules.md). What a planet's fields and type change is [planets.md](planets.md). What each installed artifact changes is [artifacts.md](artifacts.md). A voyage leaves a planet only when that planet's owner and junk owner are the same wallet.

`homeLocations.json` is a JSON array in the wallet folder. It is absent until the first home is initialized. Do not put a private key in it.

## Report

Use three sentences: which decision was taken, which wallet was used, and the save folder. Do not list contract addresses unless the owner asks.
