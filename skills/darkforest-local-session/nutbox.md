# Nutbox score pool

Score withdrawals stake into this pool. The unburned part of a buy-silver payment is injected here and split by stake. Read the pool from the chain before either action. Use the addresses below. If one of them has no code, stop. Do not deploy a pool.

`DFXStarConfig` is the source of the pool addresses and the burn ratio. Its table id is in [play.md](play.md). Static data is packed from the left:

1. `scoreStakingPool`, 20 bytes
2. `paymentToken`, 20 bytes
3. `stakingFactory`, 20 bytes
4. `community`, 20 bytes
5. `buySilverSystem`, 20 bytes (the `BuySilverSystem` contract, not the World; approve the payment token to this address)
6. `burnBps`, 2 bytes, big-endian `uint16`. 5000 burns half. 0 injects the whole payment. 10000 burns the whole payment.

`DFXStarConfig` on this world is:

| Role                | Address                                      |
| ------------------- | -------------------------------------------- |
| Pool                | `0x77C42321c605832B29367a0fc7b20678d1D0B82A` |
| Staking factory     | `0xDDa0648FA8c9cD593416EC37089C2a2E6060B45c` |
| Community           | `0x7bDE4d116192B38372DAD2F493753ea1D0Dafcf8` |
| Payment token AIPRO | `0xfBDA3b5495D8f5F61804FfeB8C61FdEa50D531F5` |
| BuySilverSystem     | `0x839eB592E11947397F3A56360af225d38F44ED97` |

The community address is a contract. Do not send AIPRO to it as if it were a wallet. The pool stores this World once and cannot change it. `depositFromGame` accepts only that World. Do not call `addAdmin`, `removeAdmin`, or fee setters. Do not mint AIPRO.

## Read before a score or a buy

One Multicall3 `aggregate3`, `allowFailure` false. Use the pool, factory, and payment token from `DFXStarConfig`.

| Call                                       | What it decides                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Pool code size                             | `0` means the pool is not there. Stop. Do not deploy one                                    |
| Pool `world()`                             | Must equal the World `0x3295A33430Bb33696b5F04DC12DD91276213100e`. This is the bound scorer |
| Factory `poolOfWorld(world)`               | Must equal the pool. A second pool for the same World cannot be created                     |
| Pool `getTotalStakedAmount()`              | A buy with a non-zero remainder reverts while this is 0. `burnBps` 10000 does not           |
| Pool `getUserStakedAmount(player)`         | This wallet's score stake                                                                   |
| Pool `getPendingAllRewards(player)`        | Two `uint256` words: community pending, then injected pending                               |
| Token `balanceOf(player)`                  | This wallet's AIPRO. Score staking does not transfer it                                     |
| Token `allowance(player, buySilverSystem)` | Buy silver pulls tokens into `BuySilverSystem`. Approve that address, not the World         |

`getPendingAllRewards` does not pay the wallet. Read both numbers from the pool. Do not invent an AIPRO emission rate. The unburned part of a buy-silver payment is injected into the pool and split by stake. The burned part is not in that pending balance. Both are separate from the community release.

Write `totalStaked`, `myStaked`, `pendingCommunity`, `pendingInjected`, and `pool` into the round's `snapshots.ndjson` line. `pool` is the score-staking address from config.

## Withdraw silver stakes score

The send is in [actions.md](actions.md). After the receipt the planet's silver falls, `PlayerScore` rises by the withdrawn chain amount, and the World calls `depositFromGame(player, delta)` on the pool. The delta is the withdrawn amount, not the player's total score. A zero delta does not call the pool.

The withdraw system does not call the pool itself. It calls the root system `StakeScoreSystem`, which runs inside the World, so the pool sees the World as the caller. That caller must equal `pool.world()`. Do not add the withdraw systems as admins. A player calling `StakeScoreSystem` does not stake. Material withdrawal uses the same call.

This call does not move AIPRO. It increases `userStakes` and `totalStaked`. It can be the first stake in the pool. It reverts when the pool has no code, when `pool.world()` is not this World, or when the pool's community calls fail. Send it with no ETH attached. `pool.world()` is `0x3295A33430Bb33696b5F04DC12DD91276213100e`.

## Buy silver burns, then injects the remainder

The send is in [actions.md](actions.md). The price is in [rules.md](rules.md). Approve the payment token to `buySilverSystem` for the discounted whole-token price, then call World `df__buySilver`. The `df` system is a normal call, so `BuySilverSystem` pulls the full price. It sends `price × burnBps / 10000`, rounded down, to `0x000000000000000000000000000000000000dEaD`, then calls `injectRewards` with the remainder. The pool splits that remainder across current stakers by stake. When the remainder is above 0, the call reverts while `totalStaked` is 0, so a score deposit has to land first. When `burnBps` is 10000 the remainder is 0, `injectRewards` is not called, and no stake is required. A score deposit is different: only the World, through the root `StakeScoreSystem`, may call `depositFromGame`. The namespace owner changes the ratio with `df__updateSilverBurnBps`. Values above 10000 revert. Rewriting the pool addresses with `df__setDFXStarConfig` leaves `burnBps` as it is.

The whole-token amount counts against the cap in [play.md](play.md). If `balanceOf` is below the price, or the remaining cap is below the price, do not send it. Tell the owner. Do not mint AIPRO and do not spend another account's tokens.

## Claim

Call `claimExternalRewards()` on the pool with no ETH attached. This pays the injected pending in AIPRO and clears it. It does not pay community pending, and it is not a spend. Skip the call when injected pending is 0. Record it in `actions.ndjson` as `claim`.
