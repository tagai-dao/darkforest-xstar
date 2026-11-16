# Actions

Each action below has three parts. **Send** is the call and the arguments. **Effect** is what the receipt changes. **Impact** is what that change does to later moves, other wallets, score, stake, or AIPRO. The strategy file chooses the sequence of actions for the round. Send that sequence in order, as [play.md](play.md) describes. Map mining is not an action here. It stays in [mining.md](mining.md).

Population and silver amounts on chain are display amounts times 1000. Hashes in calls are decimal integers, the planet hash with no `0x` prefix. Sign with the player wallet. Wait for a successful receipt. Only then append one line to `actions.ndjson` and, if AIPRO moved, one line to `spends.ndjson`. Derive `time` from the receipt block's chain timestamp in UTC; do not use local submission time or the key `at`. Never create an executed-action record for a failed, pending, or unreceipted transaction.

A World call that charges the entry fee needs `value` of at least `1000000000000` wei. `df__buyJunk` does not charge that fee. Its `value` is only the junk-limit price below.

The `strategy` field is the current filename, such as `aggressive.md`.

## Catalog

These are the player calls. `legacyMove`, `legacyUpgradePlanet`, `legacyRevealLocation`, `findArtifact`, and `initializePlayer` run the same body as the current function. Send the current name. A call marked "ask" locks the AIPRO NFT or spends AIPRO or ETH beyond the entry fee, so ask the owner before the first one.

| Action                              | Call                                                                 | Ask            |
| ----------------------------------- | -------------------------------------------------------------------- | -------------- |
| Stake an AIPRO NFT                  | NFT `approve`, locker `stake` in [SKILL.md](SKILL.md)                | yes            |
| Register, spawn                     | `df__registerPlayer`, `df__spawnPlayer` in [home.md](home.md)        | no             |
| Rename                              | `df__changePlayerName`                                               | no             |
| Change burner                       | `df__changeBurnerWallet`                                             | no             |
| Move                                | `df__move`                                                           | no             |
| Recall a fleet                      | `df__revertMove`                                                     | no             |
| Reveal coordinates                  | `df__revealLocation`                                                 | no             |
| Upgrade                             | `df__upgradePlanet`                                                  | no             |
| Register junk, clear junk           | `df__addJunk`, `df__clearJunk`                                       | no             |
| Raise the junk limit                | `df__buyJunk`                                                        | yes            |
| Buy silver                          | `df__buySilver`                                                      | yes, AIPRO cap |
| Withdraw silver                     | `df__withdrawSilver`                                                 | no             |
| Withdraw material                   | `df__withdrawMaterial`                                               | no             |
| Claim injected AIPRO                | pool `claimExternalRewards`                                          | no             |
| Prospect, find an artifact          | `df__prospectPlanet`, `df__findingArtifact`                          | no             |
| Charge, activate, shut down         | `df__chargeArtifact`, `df__activateArtifact`, `df__shutdownArtifact` | no             |
| Land a pink bomb                    | `destroy` on the pink-bomb proxy                                     | no             |
| Withdraw or deposit an artifact NFT | `df__withdrawArtifact`, `df__depositArtifact`                        | no             |
| Guild                               | the twelve `df__` guild calls below                                  | create asks    |
| Set an emoji                        | `df__setPlanetEmoji`                                                 | no             |
| GPT credits                         | `df__buyGPTTokens`, `df__spendGPTTokens`, `df__sendGPTTokens`        | buy asks       |
| Advance the clock                   | `df__tick`                                                           | no             |

Do not call these. They are closed or limited to the namespace owner: `InitializeSystem`, `PlanetWriteSystem`, `TestOnlySystem`, `df__pause`, `df__unpause`, `df__updateTickRate`, `df__updateEntryFee`, `df__disableArtifactWithdrawal`, `df__registerArtifact`, and `GuildSystem.withdraw`. `df__registerArtifact` accepts only the artifact install module.

## Move

**Send.** Capture, reinforce, and attack are one World call. Prove with `packages/client/src/Shared/snarks/move.wasm` and `move.zkey`, from `packages/client`, using the browser bundle `packages/client/public/snarkjs.min.js`. Circuit inputs are strings: `x1`, `y1`, `x2`, `y2`, `r` (world radius `100000`), `distMax` (ceil of the distance), `PLANETHASH_KEY` `1729`, `SPACETYPE_KEY` `1730`, `SCALE` `8192`, `xMirror` `0`, `yMirror` `0`, `targetDistFromOriginSquare` (`x2^2 + y2^2`).

World `df__move` takes the Groth16 proof, the 11 public signals in this order, then population, silver, artifact id, and a materials array: from hash, to hash, perlin at the destination, world radius, distMax, `1729`, `1730`, `8192`, `0`, `0`, destination radius square. It reverts with `PlanetOwnershipMismatch` when the source owner and junk owner differ. The destination's junk owner is not checked.

**Effect.** The source energy, silver, and materials fall by the amounts sent. Silver and materials arrive in full. Energy arrives after the distance loss in [rules.md](rules.md). The fleet stays in flight until the arrival tick. A paused ticker does not advance that tick, so the fleet does not arrive. On arrival, a capture of an unowned planet leaves the arrived energy there and sets the owner to this wallet. A reinforce adds that energy to a planet this wallet or the same guild already owns, and adds the silver and materials up to the destination cap. An attack reduces the destination, and a successful attack sets the owner to this wallet. Silver and materials do not increase the damage.

**Impact.** Energy gathered on a planet this wallet holds can leave again from that planet. The next voyage uses that planet's range and speed, so an attack from a farther-ranged or faster planet can arrive sooner, or with energy, when a direct send from the producing planet would not. That second send waits until this fleet has arrived, and the departure planet must already be registered by this wallet. The destination junk owner does not move with a capture, so a newly captured planet cannot launch until this wallet registers it. The previous junk owner keeps that quota until then. Other players can see the fleet when they know the destination. Record `move` with `to` set to the destination hash, 64 lowercase hex characters and no `0x` prefix. The next round reads that fleet from `to`. Other actions omit `to`.

## Upgrade

**Send.** World `df__upgradePlanet(uint256 planetHash, uint256 rangeTimes, uint256 speedTimes, uint256 defenseTimes)`. The three integers are extra levels to apply, not the new totals. No proof. It reverts when this wallet is not both the owner and the junk owner, or when the planet does not have enough silver.

**Effect.** Silver on that planet falls by the upgrade cost. Range, speed, or defense increases immediately.

**Impact.** A higher range changes which planets the next move can reach. The silver spent is no longer available for another upgrade or for a later withdraw. Record `upgrade`.

## Buy silver

**Send.** Read the pool, the payment token, and `buySilverSystem` from [nutbox.md](nutbox.md). Price the pack from [rules.md](rules.md): the planet's level picks the row, tier 0, 1, 2, or 3 is 20%, 50%, 80%, or 150%, and `SilverFrontier` discounts only the AIPRO. Approve the payment token to `buySilverSystem` for that discounted whole-token price. Do not approve the World. Then World `df__buySilver(uint256 planetHash, uint8 tier)`. Do not send on level 0, on a spacetime rip, when the chain silver plus the pack exceeds the chain cap, or when the balance or the remaining AIPRO cap is below the price.

**Effect.** The contract adds the pack's chain silver, display amount times 1000. The payment token moves from this wallet to `BuySilverSystem`. That system burns `price × burnBps / 10000`, rounded down, to `0x000000000000000000000000000000000000dEaD`, and injects the remainder into the Nutbox pool. Read `burnBps` from `DFXStarConfig`; deploy writes 5000. The call reverts on a spacetime rip, on level 0, for an unknown tier, when this wallet is not registered or not the owner, when the junk owner differs, when `addJunkTick` is 0, or when the added silver would pass the cap. It also reverts when the remainder is above 0 and the pool's total stake is zero. A `burnBps` of 10000 leaves a zero remainder and does not need stakers.

**Impact.** Stakers can later claim their share of the injected remainder. The burned part is not claimable. A wallet that owns all of the stake mostly receives that remainder back on claim. The planet's level does not change, so a later pack on the same planet uses the same row unless the frontier has risen. Registering while the stored tick is 0 leaves `addJunkTick` at 0, so buy silver on that planet keeps reverting until a later registration sees a non-zero tick. Record the discounted whole-token amount in `spends.ndjson` and record `buy-silver`.

## Withdraw silver

**Send.** World `df__withdrawSilver(uint256 planetHash, uint256 amount)`. The amount is chain units, display times 1000, and must be at least one fifth of the silver cap. The planet must be an owned spacetime rip with this wallet as junk owner.

**Effect.** Silver on the planet falls. `PlayerScore` rises by that amount. The same amount is staked with `depositFromGame`. No AIPRO moves. It reverts when the pool has no code or the World is not a factory admin. Those checks are in [nutbox.md](nutbox.md).

**Impact.** This is how the pool gets its first stake. Until some wallet has done it, a buy whose remainder is above 0 reverts. A larger stake takes a larger share of later injections. If this wallet is in a guild, the guild silver rises by the same amount. Record `withdraw-silver`.

## Add junk

**Send.** World `df__addJunk(uint256 planetHash, uint256 biomebase, Proof proof)`. The caller must own the planet after the call settles, as [rules.md](rules.md) describes. The call ticks, applies a due inbound fleet, then checks the owner. A table read that still shows the zero address is the last write, not that check. Compute the settlement off chain and send this call when it leaves this wallet as the owner. Prove with `packages/client/src/Shared/snarks/biomebase.wasm` and `biomebase.zkey`, from `packages/client`, using `packages/client/public/snarkjs.min.js`. Circuit inputs are strings: `x`, `y`, `PLANETHASH_KEY` `1729`, `BIOMEBASE_KEY` `1731`, `SCALE` `8192`, `xMirror` `0`, `yMirror` `0`. `biomebase` is the perlin value at that coordinate with key `1731`. The proof's public signals are the planet hash, that biomebase, `1729`, `1731`, `8192`, `0`, `0`. Pass that same biomebase as the second argument. A value of 0 is valid only when the perlin value is 0.

**Effect.** The level cost is `50, 55, 60, 65, 75, 100, 200, 250, 300, 500` for levels 0 through 9. The call reverts when used junk plus that cost is above the limit. On success this wallet's used junk rises by the cost, this wallet becomes the junk owner, and `addJunkTick` becomes the current tick. A previous junk owner's used junk falls by the same cost. The first registration of an asteroid field initializes its materials. No AIPRO moves.

**Impact.** Move, upgrade, withdraw, buy silver, and artifact calls on this planet stay closed until the owner and the junk owner match. Energy and silver grow on later ticks only after they match, and they do not grow while the ticker is paused. Registering at stored tick 0 writes `addJunkTick` 0, which still blocks buy silver. Record `add-junk` with the planet and the used and limit numbers.

## Clear junk

**Send.** World `df__clearJunk(uint256 planetHash)`. No proof. The caller must be the junk owner. The planet owner does not have to be this wallet.

**Effect.** Used junk falls by that planet's level cost and the junk owner becomes the zero address. When this wallet also owns the planet, the owner becomes the zero address too. Energy and silver stay on the planet.

**Impact.** Clearing a planet this wallet still owns abandons it. Anyone can capture what is left. Clearing a planet someone else owns only returns the quota; they keep the planet and still cannot launch until they register. Record `clear-junk` and say whether the planet was abandoned.

## Buy a higher junk limit

**Send.** World `df__buyJunk(uint256 allocation)` with `value` equal to the fee below. This call does not charge the entry fee. Ask the owner before the first purchase. Do not write `spends.ndjson`. `allocation` is the new cap counted in thousands. The stored limit becomes `allocation * 1000`. After spawn the allocation is 1, so the limit is 1000. The argument must be at least the current allocation and at most 1000. The cumulative fee, in wei, is 0 at allocation 1, `(allocation - 1) * 10^15` from 2 through 8, and `7 * 10^15 + (allocation - 8)^2 * 10^15` from 9 upward. Send the difference between the new fee and the current fee.

**Effect.** Only the limit changes. Used junk stays the same. No AIPRO moves.

**Impact.** A higher limit is what lets the next `add-junk` succeed after `JunkLimitExceeded`. The ETH does not return. Record `buy-junk` with the new limit and the ETH paid.

## Claim injected rewards

**Send.** On the pool from [nutbox.md](nutbox.md), call `claimExternalRewards()` with value 0. Skip it when injected pending is 0.

**Effect.** The pending injected balance is paid in the community token and then cleared. Community-emission pending stays unclaimed.

**Impact.** This is income, not a spend. It does not change stake or score. Record `claim`.

## Rename and burner

**Send.** `df__changePlayerName(string newName)` requires a registered player and a name hash nobody owns. `df__changeBurnerWallet(address newBurner)` requires a burner that is not already mapped. Neither spends a token.

**Effect.** The new name or the new burner is saved. The previous name hash and the previous burner mapping are left in place.

**Impact.** The old name and the old burner address stay taken. A later attempt to reuse either one reverts. Record `rename` or `change-burner`.

## Recall a fleet

**Send.** World `df__revertMove(uint64 moveId, bytes32 toPlanetHash)`. `toPlanetHash` is the destination the fleet is flying toward. The caller must be that fleet's captain, the source must still belong to the captain, and the stored tick must still be in the first half of the trip. The half is `(arrivalTick - departureTick) / 2`, compared with `storedTick - departureTick`. The stored tick is `Ticker.tickNumber`. While the clock is paused that number stays 0, so a fleet sent at tick 0 can be recalled.

**Effect.** The fleet leaves the destination queue. A return fleet is pushed onto the source with half the population and half the silver. Materials on that move id are halved. That move id cannot be recalled again.

**Impact.** The other half of the energy and silver is gone. The destination no longer has this inbound fleet. Record `revert-move` and set `to` to the source hash the fleet is now returning to.

## Reveal coordinates

**Send.** Prove with `packages/client/src/Shared/snarks/reveal.wasm` and `reveal.zkey`, from `packages/client`, using `packages/client/public/snarkjs.min.js`. Circuit inputs are strings: `x`, `y`, `PLANETHASH_KEY` `1729`, `SPACETYPE_KEY` `1730`, `SCALE` `8192`, `xMirror` `0`, `yMirror` `0`. World `df__revealLocation` takes the Groth16 proof and these 9 public signals, in order: planet hash, perlin, x, y, `1729`, `1730`, `8192`, `0`, `0`. x and y are the field elements the circuit uses, including the wrapped form of a negative coordinate.

**Effect.** `RevealedPlanet` stores those coordinates and this wallet as the revealer. The configured cooldown is 14400 stored ticks. A stored last-reveal of 0 counts as never revealed. A reveal while the stored tick is 0 writes 0 again, so the cooldown does not start until a reveal is recorded at a non-zero tick.

**Impact.** Other players and this wallet's later rounds can read the coordinates without mining that chunk. The planet's owner, energy, and junk do not change. Record `reveal`.

## Withdraw material

**Send.** World `df__withdrawMaterial(uint256 planetHash, uint8 materialType, uint256 amount)`. The planet must be an owned spacetime rip and this wallet must be its junk owner. The amount is chain units and must be at least one fifth of that material's cap. Material ids are 0 unknown, 1 water crystals, 2 living wood, 3 wind steel, 4 aurorium, 5 mycelium, 6 sand glass, 7 cryostone, 8 scrapium, 9 pyrosteel, 10 blackalloy, 11 corrupted crystal.

**Effect.** That material on the planet falls by the amount. Score added is `amount * multiplier`, with multipliers 100, 105, 110, 120, 130, 150, 180, 200, 250, 300, 400, and 600 for ids 0 through 11. `PlayerScore` rises by that score and the same delta is staked with `depositFromGame`. No AIPRO moves.

**Impact.** The score shown on the page rises by the display amount of that score. Stake share rises with it, so later buy-silver payments pay this wallet a larger share. Guild silver rises by the same score when this wallet is in a guild. The material is no longer on the planet to withdraw again. Record `withdraw-material`.

## Prospect and find an artifact

These are two calls. Prospect does not create an artifact. Find does. The client button "Prospect Artifact" sends prospect, waits until it is mined, then sends find. Send them as two transactions when calling the world directly. Both pay the entry fee. The contract does not require a gear ship on the foundry.

**Send.** `df__prospectPlanet(uint256 planetHash)` takes only the planet hash. The caller must own the foundry and be its junk owner. A foundry is contract type 3. The client calls that type ruins. The explored flag must be unset. If this foundry was prospected before and `prospect block + 256` is still at least the current block, prospect reverts. `df__findingArtifact` uses the same biomebase proof as `df__addJunk`: the Groth16 proof plus the 7 public signals, with the planet hash inside that input. Find reverts unless a prospect block is stored and `prospect block + 256` is still at least the current block. It also reverts when the explored flag is set.

**Effect.** Prospect writes `ProspectedPlanet` to the current block number. Energy, silver, and materials stay as they are. Find builds one artifact and pushes it into a free slot on that foundry. A foundry holds at most 8. The seed is `keccak256(planetHash, block.timestamp, blockhash(prospect block))`. The chain returns a block hash only for the last 256 blocks, so the find has to land in that window for the prospect block's hash to be part of the seed. Rarity follows the foundry level: level 0–1 common, 2–3 rare, 4–5 epic, 6–7 legendary, 8–9 mythic. The seed gives about a 1/16 chance of treating the level as one higher and about a 1/64 chance of two higher. The type is drawn from that rarity's probability table. The biome comes from the space type and the biomebase in the proof. Dead space is always corrupted. The same call sets the explored flag. Find does not charge or activate the artifact.

**Impact.** After a successful find, prospect and find both revert on this foundry. If the 256-block window ends before find, the explored flag is still unset, so prospect can be sent again and opens a new window. Charge, activate, shutdown, and moving the artifact are separate calls below. Record `prospect`, then `find-artifact`.

## Charge, activate, shut down

**Send.** All three require the planet owner, the junk owner, and an artifact on that planet. `df__chargeArtifact(uint256 planetHash, uint256 artifactId, bytes data)` starts from the default status. The planet level must sit inside the artifact's required range. Cannon charge data is empty. Pink-bomb charge data is the abi encoding of a reveal proof and a reveal input for the target. `df__activateArtifact(uint256 planetHash, uint256 artifactId, bytes data)` requires status ready, or a default artifact whose charge is 0, and the planet must have more energy than `reqPopulation` and at least `reqSilver` silver. Bloom-filter data is empty. Wormhole data is one `bytes32` destination hash. Pink-bomb activation data is a reveal proof of the launcher. `df__shutdownArtifact(uint256 planetHash, uint256 artifactId)` takes no data.

**Effect.** Charge applies the cannon's charge effect, or stores the pink bomb's target. Activate applies the cannon's before-move effect, fills a bloom filter's planet to its energy cap, writes a wormhole distance multiplier between two planets of the same owner, or reveals the pink-bomb launcher, spends the launch energy, and writes the bomb's departure and arrival. Shutdown stops an artifact whose status is charging or active and clears a pink bomb's target. Only one offensive, one defensive, and one productive artifact can be active on a planet.

**Impact.** A wormhole shortens later moves between that pair. A bloom filter makes the planet a full energy source for the next move. A charged cannon changes the planet's combat effect until shutdown. An activated pink bomb can be landed only inside its arrival window. Record `charge-artifact`, `activate-artifact`, or `shutdown-artifact`.

## Land a pink bomb

**Send.** After activation, call `destroy(uint256 bombId, Proof, RevealInput)` on the pink-bomb proxy in namespace `atf.1`, system name `ProxySystem`. Read the world ABI and use the function name written there. Do not invent the selector. The proof reveals the planet being hit. The stored tick must be at least the arrival tick and less than 300 ticks after it. The squared distance from the bomb target must be within 500², 1000², 1500², 2000², or 2500² for rarity 1 through 5.

**Effect.** The destroyed flag is set on that planet. A planet that already has the flag reverts.

**Impact.** A destroyed planet is no longer a normal capture target. The reveal also publishes the hit coordinates. Record `land-bomb`.

## Withdraw or deposit an artifact NFT

**Send.** `df__withdrawArtifact(uint256 planetHash, uint256 artifactId)` and `df__depositArtifact(uint256 planetHash, uint256 artifactId)` require an owned spacetime rip and a matching junk owner. Withdraw also requires default artifact status, rarity below the planet level, and withdrawals enabled. Deposit needs a free artifact slot and an NFT this wallet holds.

**Effect.** Withdraw removes the artifact from the planet and mints or transfers the NFT to this wallet. Deposit puts the NFT's artifact back on the planet.

**Impact.** Read the configured artifact NFT before sending either call. If that address is unset, both calls revert. Do not send them then. A withdrawn artifact is no longer on the planet to activate. Record `withdraw-artifact` or `deposit-artifact`.

## Guild

**Send.** `df__createGuild(string name)` costs `5000000000000000` wei (0.005 ETH). Ask before paying. The caller must be registered and not already in a guild. `df__inviteToGuild(address)` requires officer or leader; the invitee must be registered and guildless. `df__acceptInvitation(uint8 guildId)` requires that id in this wallet's invitations. `df__applyToGuild(uint8 guildId)` records an application. Both check the 14400-tick leave cooldown. `df__approveApplication(address)` requires officer or leader. `df__leaveGuild()` is for a member or officer. `df__kickMember(address)`, `df__transferGuildLeadership(address)`, `df__disbandGuild()`, and `df__setMemberRole(address, uint8 role)` are leader only. Role 1 is member and role 2 is officer. `df__setGrant(uint8 role)` is any member and does not change the caller's role.

**Effect.** Create makes this wallet the leader and copies its withdrawn-silver total into the guild silver. Invite, apply, and approve only change membership records. Accept and approve add a member. Leave and kick remove a member. A voluntary leave starts the cooldown. A kick does not. Transfer swaps the leader. Disband reverts while any other member remains, then marks the guild disbanded. Set-role changes a member between member and officer. Set-grant stores a grant value only.

**Impact.** A fleet whose captain and the destination owner share a guild reinforces instead of attacking. Later silver and material withdraws add their score delta to the guild silver as well as to `PlayerScore`. Leaving does not move planets or stake. A leader who wants to exit must transfer or disband first. Record `guild` and put the call name in the detail.

## Emoji

**Send.** `df__setPlanetEmoji(uint256 planetHash, string emoji)`. No proof. This wallet must be both owner and junk owner.

**Effect.** The string is stored on that planet. Energy, silver, owner, and junk do not change.

**Impact.** Other players can read the label. It does not change combat or score. Record `emoji`.

## GPT credits

**Send.** `df__buyGPTTokens(uint256 amount)` costs `amount * 10^13` wei, 0.00001 ETH per credit. Ask before the first purchase. `df__sendGPTTokens(address, uint256)` and `df__spendGPTTokens(uint256)` move or decrease an existing balance.

**Effect.** Buy increases the `GPTTokens` counter. Send moves that counter to another address. Spend decreases it and emits `TokensSpent`. Planets, silver, score, and AIPRO stay unchanged.

**Impact.** The credit does not upgrade a planet or buy silver. The ETH paid for a credit does not return. A buy is not an AIPRO spend. Record `gpt-buy`, `gpt-send`, or `gpt-spend`.

## Advance the clock

**Send.** `df__tick()` only when `paused` is false, this round has no other call, and the stored `tickNumber` is still below an arrival tick that the next read needs. One call writes every elapsed tick since the last write. Elapsed ticks are the elapsed seconds times the `tickRate` read this round. Do not send it again in later rounds to keep a wave, a silver shipment, or energy growth moving. Do not call it while `paused` is true.

**Effect.** The stored `tickNumber` becomes the last written tick plus those elapsed ticks. The call reverts while paused. Move, upgrade, junk, silver, material, reveal, and artifact calls already do this write.

**Impact.** The call writes the clock and shrinks the inner circle. It does not write planets, so the next table read still shows the old owner and the old energy. A move, junk, upgrade, withdraw, reveal, or artifact call writes the planet after it settles. Record `tick` with the `time` field from [play.md](play.md). Do not put the time under `at`.
