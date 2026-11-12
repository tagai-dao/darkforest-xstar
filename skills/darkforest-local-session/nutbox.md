# Nutbox score pool

Score withdrawals stake into this pool. Buy-silver payments are injected here and split by stake. Read the pool from the chain before either action. The addresses in `packages/contracts/df.config.toml` are mainnet AIPRO addresses. On this anvil they have no code. Do not call them. A fresh local deploy writes a local Nutbox stack into `DFXStarConfig` instead.

`DFXStarConfig` is the source of the live addresses. Its table id is in [play.md](play.md). Static data is five addresses packed from the left, 20 bytes each:

1. `scoreStakingPool`
2. `paymentToken`
3. `stakingFactory`
4. `community`
5. `buySilverSystem` (the `BuySilverSystem` contract, not the World; approve the payment token to this address)

On this anvil the config is:

| Role                | Address                                      |
| ------------------- | -------------------------------------------- |
| Pool                | `0x77C42321c605832B29367a0fc7b20678d1D0B82A` |
| Staking factory     | `0xDDa0648FA8c9cD593416EC37089C2a2E6060B45c` |
| Community           | `0x7bDE4d116192B38372DAD2F493753ea1D0Dafcf8` |
| Payment token AIPRO | `0xfBDA3b5495D8f5F61804FfeB8C61FdEa50D531F5` |
| BuySilverSystem     | `0x839eB592E11947397F3A56360af225d38F44ED97` |
| Committee           | `0x24432a08869578aAf4d1eadA12e1e78f171b1a2b` |

This token was issued once: `1000000000` whole tokens, all on the anvil deployer `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`. Move them with `transfer` from that account. Do not mint. `0x7bDE4d116192B38372DAD2F493753ea1D0Dafcf8` is the Nutbox community contract, not a wallet. Do not spend the deployer key unless the owner asks.

A fresh deploy already creates this stack: committee, community factory, hourly calculator, AIPRO token, staking factory, and one pool. The pool ratio is `10000`, so the whole local distribution goes to this pool. Restarting anvil drops the contracts. The same deploy from nonce 0 creates these addresses again. If the pool or the World has no code, the deploy has not finished. Stop. Do not deploy a second stack.

The live AIPRO community has three other pools, and its DFX pool ratio is `0`. Those factories are not in this repo. This local community has one pool, and that pool takes the whole ratio. The hourly calculator still starts with an empty policy, so nothing is released until an injection. The pool stores this World once and cannot change it. `depositFromGame` accepts only that World.

Do not call `addAdmin`, `removeAdmin`, or the committee fee setters. The factory admin list does not grant scoring.

## Read before a score or a buy

One Multicall3 `aggregate3`, `allowFailure` false. Use the pool, factory, and payment token from `DFXStarConfig`.

| Call                                       | What it decides                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Pool code size                             | `0` means this deploy has not finished                                                      |
| Pool `world()`                             | Must equal the World `0x3295A33430Bb33696b5F04DC12DD91276213100e`. This is the bound scorer |
| Factory `poolOfWorld(world)`               | Must equal the pool. A second pool for the same World cannot be created                     |
| Pool `getTotalStakedAmount()`              | Buy silver reverts while this is 0. The first score deposit may be the stake that opens it  |
| Pool `getUserStakedAmount(player)`         | This wallet's score stake                                                                   |
| Pool `getPendingAllRewards(player)`        | Two `uint256` words: community pending, then injected pending                               |
| Token `balanceOf(player)`                  | Whole-token balance of the local AIPRO. Score staking does not transfer it                  |
| Token `allowance(player, buySilverSystem)` | Buy silver pulls tokens into `BuySilverSystem`. Approve that address, not the World         |

`getPendingAllRewards` does not pay the wallet. Community pending stays 0 until the hourly calculator has an injection. Do not invent an AIPRO emission rate. The local pool's share of a future community injection is its ratio, `10000` out of `10000`, because it is the only pool. Buy-silver payments do not use that ratio. They are injected into the pool and split by stake.

Write `totalStaked`, `myStaked`, `pendingCommunity`, `pendingInjected`, and `pool` into the round's `snapshots.ndjson` line. `pool` is the score-staking address from config.

## Withdraw silver stakes score

The send is in [actions.md](actions.md). After the receipt the planet's silver falls, `PlayerScore` rises by the withdrawn chain amount, and the World calls `depositFromGame(player, delta)` on the pool. The delta is the withdrawn amount, not the player's total score. A zero delta does not call the pool.

The withdraw system does not call the pool itself. It calls the root system `StakeScoreSystem`, which runs inside the World, so the pool sees the World as the caller. That caller must equal `pool.world()`. Do not add the withdraw systems as admins. A player calling `StakeScoreSystem` does not stake. Material withdrawal uses the same call.

This call does not move AIPRO. It increases `userStakes` and `totalStaked`. It can be the first stake in the pool. It reverts when the pool has no code, when `pool.world()` is not this World, or when the pool's community calls fail. Fees on this stack are 0, so the withdraw does not need attached ETH. `pool.world()` on this deploy is `0x3295A33430Bb33696b5F04DC12DD91276213100e`.

## Buy silver injects AIPRO

The send is in [actions.md](actions.md). The price is in [rules.md](rules.md). Approve the payment token to `buySilverSystem` for the discounted whole-token price, then call World `df__buySilver`. The `df` system is a normal call, so `BuySilverSystem` pulls the tokens and calls `injectRewards`. The pool splits that amount across current stakers by stake. The call reverts when `totalStaked` is 0, so a score deposit has to land first. A score deposit is different: only the World, through the root `StakeScoreSystem`, may call `depositFromGame`.

The whole-token amount counts against the cap in [play.md](play.md). If `balanceOf` is below the price, or the remaining cap is below the price, do not send it. Tell the owner. The local AIPRO supply was minted to the anvil deployer. Do not use that deployer key to mint or transfer unless the owner asks for tokens.

## Claim

Call `claimExternalRewards()` on the pool with value 0. The fee is 0. This pays the injected pending in AIPRO and clears it. It does not pay community pending, and it is not a spend. Skip the call when injected pending is 0. Record it in `actions.ndjson` as `claim`.
