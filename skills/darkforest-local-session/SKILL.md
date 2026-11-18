---
name: darkforest-local-session
description: Join the local Dark Forest simulation, initialize a home planet, mine outward from that home, and play with a named strategy file. Use when the owner wants an agent to start this local game, stake an AIPRO NFT, spawn a home, mine, take the next game action, or pastes a block that starts with DARKFOREST_MOVE, DARKFOREST_WITHDRAW_MATERIAL, DARKFOREST_WITHDRAW_SILVER, DARKFOREST_BUY_SILVER, DARKFOREST_UPGRADE, DARKFOREST_ADD_JUNK, DARKFOREST_FIND_ARTIFACT, DARKFOREST_USE_ARTIFACT, or DARKFOREST_CLEAR_JUNK.
---

# Local simulation

The owner does not know the chain, contracts, or price. Do not ask for them. The addresses below are the contracts for this game. Read them from the chain and stop if they do not match. Do not switch chains. Do not deploy contracts. If Multicall3 or the World has no code, stop.

| Item            | Value                                                                                   |
| --------------- | --------------------------------------------------------------------------------------- |
| Chain ID        | `31337`                                                                                 |
| RPC             | `http://127.0.0.1:8545` (`http://localhost:8545` is the same)                           |
| World           | `0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f`                                            |
| AIPRO NFT       | `0x3a622DB2db50f463dF562Dc5F341545A64C580fc`                                            |
| Handle registry | `0xc6B407503dE64956Ad3cF5Ab112cA4f56AA13517`                                            |
| Locker          | `0x6A47346e722937B60Df7a1149168c0E76DD6520f`                                            |
| Entry           | Stake one AIPRO NFT in the locker. There is no DFPT and no pass to buy.                 |
| Season          | Read `activeSeason()` on the locker.                                                    |
| Multicall3      | `0xcA11bde05977b3631167028862bE2a173976CA11`. If this address has no code, stop.        |
| Player          | The wallet the owner connected for this run. Do not write that address into this skill. |

After each local deploy, rewrite the AIPRO NFT, handle registry, and locker above, and the five Nutbox addresses in [nutbox.md](nutbox.md), from that deploy's PostDeploy log. Leave World and Multicall3 unchanged when the log shows the same values.

Anvil can reset while reusing chain ID, World address, and season number. At the start of a new run, verify the current World, locker, NFT, handle registry, and pool on chain before opening a wallet save. A matching folder name alone does not prove that its files belong to this deployment. If the owner removed the previous game files, treat the new wallet folder as empty; do not restore old `homeLocations.json`, `knownBoard.ndjson`, `planets`, `voyages`, `actions.ndjson`, or `strategy.txt` from another run. Create fresh files only after the current chain and wallet state have been read. Keep stopped mining and strategy processes stopped until the owner explicitly starts them for this run.

After a restart, treat any earlier chain snapshot, transaction receipt, staked NFT, registered name, home, and in-memory signer as unverified. Pin a fresh block and read the current `GamePassNFT` World record through the verified Multicall3; check the locker, NFT, handle registry, and pool against the current deployment before making a game decision. Derive the player address from a signer that is **still live**, then read that player's current-season membership and `SpawnPlanet` from this deployment. A socket path or a saved address by itself does not prove that its old signer process survived the restart. Do not resume an old transaction plan or copy a prior season's map or action log into the new save. The PostDeploy log and a wallet folder are supporting evidence; the current chain state decides what is live.

Use the active World from `packages/contracts/worlds.json` for chain 31337, and verify its code before using it. Read the locker from the World table and the NFT and handle registry from that locker. If this wallet is not already in the season and holds an NFT, approve that NFT to the locker, then call `stake` on the locker. Stake transfers that NFT into the locker, so a wallet already in the season has an NFT balance of 0 and still plays. A wallet with a handle and no NFT pays to mint first. Do not call `setHandle`. Stop if any required address has no code or the locker reports a different active World.

Set both `NO_PROXY=127.0.0.1,localhost` and `no_proxy=127.0.0.1,localhost` before calling the RPC. If the RPC cannot be reached, stop.

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

## Pasted material score

The game page does not withdraw material. On a spacetime rip it copies a block. The first line is `DARKFOREST_WITHDRAW_MATERIAL`. The next line is one JSON object with `"kind": "darkforest-withdraw-material"`.

That JSON is the whole withdrawal. The moment it is recognized, send it in this turn. Do not wait for another message. Do not ask to start, do not ask which planet, and do not ask which material or how much to withdraw. `amount` is already chain units. Do not multiply it by 1000. Do not mine, do not open the map, and do not run a strategy round before this send. Do not change `planetHash`, `materialType`, or `amount`.

Call World `df__withdrawMaterial` with `planetHash`, `materialType`, and `amount`. There is no proof. Attach `entryFeeWei` wei as the transaction value. Sign with the player wallet. Wait for a successful receipt. Then record `withdraw-material` as [actions.md](actions.md) describes. If the receipt reverts, tell the owner and do not write `actions.ndjson`.

## Pasted silver score

The game page does not withdraw silver. On a spacetime rip it copies a block. The first line is `DARKFOREST_WITHDRAW_SILVER`. The next line is one JSON object with `"kind": "darkforest-withdraw-silver"`.

That JSON is the whole withdrawal. The moment it is recognized, send it in this turn. Do not wait for another message. Do not ask to start, do not ask which planet, and do not ask how much silver to withdraw. `amount` is already chain units. Do not multiply it by 1000. Do not mine, do not open the map, and do not run a strategy round before this send. Do not change `planetHash` or `amount`. A silver mine cannot take this call. The pasted `planetHash` is the spacetime rip.

Call World `df__withdrawSilver` with `planetHash` and `amount`. There is no proof. Attach `entryFeeWei` wei as the transaction value. Sign with the player wallet. Wait for a successful receipt. Then record `withdraw-silver` as [actions.md](actions.md) describes. If the receipt reverts, tell the owner and do not write `actions.ndjson`.

## Pasted silver purchase

The game page does not buy silver. On a planet that can buy it, the page copies a block. The first line is `DARKFOREST_BUY_SILVER`. The next line is one JSON object with `"kind": "darkforest-buy-silver"`.

That JSON is the whole purchase. The moment it is recognized, approve and send it in this turn. Do not wait for another message. Do not ask to start, do not ask which planet, and do not ask which tier. Do not change `planetHash`, `tier`, `priceWei`, `paymentToken`, or `buySilverSystem`. Do not mine and do not open the map. `tier` is 0, 1, 2, or 3. The call does not take a silver amount.

If `allowance(player, buySilverSystem)` is below `priceWei`, approve `paymentToken` to `buySilverSystem` for `priceWei`. Do not approve the World. Then call World `df__buySilver` with `planetHash` and `tier`. Attach `entryFeeWei` wei. Sign with the player wallet. Wait for a successful receipt. Record `priceWhole` in `spends.ndjson` and record `buy-silver` as [actions.md](actions.md) describes. If the approval or the receipt reverts, tell the owner and do not write `actions.ndjson` or `spends.ndjson`.

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

A message can contain more than one of these blocks. Send every fleet first, then every junk registration, then every artifact find, then every artifact use, then every silver withdrawal, then every material withdrawal, then every silver purchase, then every upgrade, then every junk clear, all in this turn.

## Ask first

After reading this skill, ask whether to start. Do not ask again in this conversation if the owner already answered. A message that contains `DARKFOREST_MOVE`, `DARKFOREST_WITHDRAW_MATERIAL`, `DARKFOREST_WITHDRAW_SILVER`, `DARKFOREST_BUY_SILVER`, `DARKFOREST_UPGRADE`, `DARKFOREST_ADD_JUNK`, `DARKFOREST_FIND_ARTIFACT`, `DARKFOREST_USE_ARTIFACT`, or `DARKFOREST_CLEAR_JUNK` is an order, not a new start. Send each order as its pasted section describes, and do not ask this question.

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
WORLD=0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f

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
5. The wallet is not in the season, has a handle, and the NFT balance is 0: **paid mint**. Ask before spending. Then stake the minted token.
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

No AIPRO NFT, and not already in the season. Ask before minting. The question names the wallet, the AIPRO price, and the native fee.

> Mint an AIPRO NFT with this wallet now? It costs 100000 AIPRO and 0.01 ETH. The NFT stays in this wallet until it is staked.

A wallet already in the season is not this case. Its balance is 0 because the locker holds the NFT, and play continues. If the owner says no, stop.

Not enough gas. Do not send a transaction. Tell the owner this wallet needs ETH for gas.

Joined, and a home is saved. If `strategy.txt` is missing or mining has not been started, ask the mining and strategy question from [mining.md](mining.md) and wait. Do not end the turn with only the home coordinates. Do not ask them to confirm the home again.

Joined, but no home yet. If this player is not registered, ask for a name before searching. Follow [home.md](home.md). A search the owner already stopped stays stopped until they say to continue.

## Transactions after confirmation

Sign with the current wallet. A legacy transaction is fine. Do not write a private key into any file, and do not let the page sign. Wait for each receipt before the next step. If a transaction fails, tell the owner the reason and do not retry against a different contract.

Paid mint, only after the owner says yes:

1. Read `communityTokenPrice()` and `nativePrice()` on the NFT. The local collection returns `100000` AIPRO, which is `100000` ether in raw units, and `0.01` ether. Stop if either value differs.
2. Read the AIPRO balance. The payment token is `paymentToken` in `DFXStarConfig`, the address in [nutbox.md](nutbox.md). Stop if the balance is below the price, or the ETH balance cannot cover `0.01` ether plus gas. Tell the owner which one is short. Do not mint from another wallet.
3. Read `allowance(player, NFT)`. If it is below the price, approve the NFT for the price. Approve the NFT contract, not the locker and not the World.
4. Call NFT `mint(uint256 referrerTokenId)` with value `nativePrice`. Pass `0` unless the owner named a referrer token id. The receipt mints the next token to this wallet. The wallet must already have a handle. Do not call `setHandle`.

Stake:

1. Read `getApproved(tokenId)` on the NFT. If it is not the locker, call NFT `approve(locker, tokenId)`. Approve only this token.
2. Call locker `stake(tokenId)`.

Do not call `withdraw` while `isTokenInGame(tokenId)` is true. The season has to be cleared or moved on before that NFT can come back.

`cast` is one way to do this. `<player>` and the signing account must be the current wallet. `$NFT` and `$LOCKER` are the addresses read above.

```bash
export NO_PROXY=127.0.0.1,localhost
export no_proxy=127.0.0.1,localhost
RPC=http://127.0.0.1:8545

# Paid mint. $AIPRO is the payment token. Value is nativePrice, 0.01 ether.
cast send --legacy --rpc-url $RPC $AIPRO "approve(address,uint256)" $NFT 100000000000000000000000
cast send --legacy --rpc-url $RPC $NFT "mint(uint256)" 0 --value 0.01ether

cast send --legacy --rpc-url $RPC $NFT "approve(address,uint256)" $LOCKER <tokenId>
cast send --legacy --rpc-url $RPC $LOCKER "stake(uint256)" <tokenId>
```

## Save

The root is the folder the owner named. The wallet folder contains `agent.json` directly. Tell the owner that folder path, not the season folder above it.

Add two levels under the root:

`<root>/31337-0xfdf868ea710ffd8cd33b829c5aff79edd15ecd5f-<season>/<wallet lowercase>/agent.json`

`agent.json` contains only:

```json
{ "address": "<wallet lowercase>" }
```

`game.json` sits next to it and names this game. Write it when the folder is created, and write it if the folder already exists without it:

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

After a successful stake, prepare this folder and tell the owner the full path. Then read [home.md](home.md). Read [mining.md](mining.md) only after the home exists and its coordinates are in `homeLocations.json`. Map mining stays on that path. The next game action after the owner picks a strategy is [play.md](play.md). A preset or a custom strategy file is one prediction per round, then zero or more calls sent in order. A strategy file states a goal and a method. `aggressive.md` expands by taking a higher-level planet. The calls are chosen from [actions.md](actions.md). Score staking, buy silver, and claims use the Nutbox pool in [nutbox.md](nutbox.md). If that pool has no code, stop. Do not deploy one. Every player call, including junk, reveal, artifacts, materials, guilds, and fleet recall, is listed in [actions.md](actions.md). The game rules are [rules.md](rules.md). What a planet's fields and type change is [planets.md](planets.md). What each installed artifact changes is [artifacts.md](artifacts.md). A voyage leaves a planet only when that planet's owner and junk owner are the same wallet.

`homeLocations.json` is a JSON array in the wallet folder. It is absent until the first home is initialized. Do not put a private key in it.

## Report

Use three sentences: which decision was taken, which wallet was used, and the save folder. Do not list contract addresses unless the owner asks.
