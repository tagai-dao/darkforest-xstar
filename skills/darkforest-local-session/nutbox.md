# Nutbox score pool

Score withdrawals stake into this pool. Buy-silver payments are injected here and split by stake. Read the pool from the chain before either action. The addresses in `packages/contracts/df.config.toml` are mainnet AIPRO addresses. On this anvil they have no code. Do not call them.

`DFXStarConfig` is the source of the live addresses. Its table id is in [play.md](play.md). Static data is five addresses packed from the left, 20 bytes each:

1. `scoreStakingPool`
2. `paymentToken`
3. `stakingFactory`
4. `community`
5. `buySilverSystem` (the World, because a system call is a delegatecall)

On this anvil the config is:

| Role                | Address                                      |
| ------------------- | -------------------------------------------- |
| Pool                | `0x5cc0968e6d80FD57480aA97e1E4a297c29e3bea4` |
| Staking factory     | `0x01cf58e264d7578D4C67022c58A24CbC4C4a304E` |
| Community           | `0xe81b3aDD4BA501176d9f91220396c2E1CA1c4c07` |
| Payment token AIPRO | `0x21aC96e55736583a284F4f26e2a8EF4E74C0F45c` |

This token was issued once: `1000000000` whole tokens, all on the anvil deployer `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`. Move them with `transfer` from that account. Do not mint. `0xe81b3aDD4BA501176d9f91220396c2E1CA1c4c07` is the Nutbox community contract, not a wallet. Do not spend the deployer key unless the owner asks.
| Committee | `0xaB837301d12cDc4b97f1E910FC56C9179894d9cf` |

If the pool address in `DFXStarConfig` has code, use that record even when it differs from the table above. A restarted anvil drops these contracts. If the pool address has no code, attach a local stack once, then read the new record. Do not attach a second stack when the pool already has code.

## Attach when the pool has no code

Run this from `packages/contracts`. `PRIVATE_KEY` is already in that package's `.env`. Do not print it. Do not restart the chain. Do not run `PostDeploy`.

```bash
export NO_PROXY=127.0.0.1,localhost
export no_proxy=127.0.0.1,localhost
cd packages/contracts
forge script script/AttachLocalNutbox.s.sol \
  --sig "run(address)" 0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast
```

The script deploys a committee with zero fees, a community, a local AIPRO token, a staking factory, and one pool at ratio `10000`. It adds the World as a factory admin and as a fee-free address, then writes `DFXStarConfig`. Copy the logged addresses. Those replace the table above.

Do not call `addAdmin`, `removeAdmin`, or the committee fee setters yourself. The World is the only admin the game needs. `depositFromGame` rejects every other caller with `Not admin`.

## Read before a score or a buy

One Multicall3 `aggregate3`, `allowFailure` false. Use the pool, factory, and payment token from `DFXStarConfig`.

| Call                                | What it decides                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| Pool code size                      | `0` means the attach step above has not been done                                          |
| Factory `isAdmin(world)`            | Must be true before a withdraw. The World is `0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f`  |
| Pool `getTotalStakedAmount()`       | Buy silver reverts while this is 0. The first score deposit may be the stake that opens it |
| Pool `getUserStakedAmount(player)`  | This wallet's score stake                                                                  |
| Pool `getPendingAllRewards(player)` | Two `uint256` words: community pending, then injected pending                              |
| Token `balanceOf(player)`           | Whole-token balance of the local AIPRO. Score staking does not transfer it                 |
| Token `allowance(player, world)`    | Buy silver pulls tokens into the World, so the allowance target is the World               |

`getPendingAllRewards` does not pay the wallet. Community pending stays 0 until the hourly calculator has an injection. Do not invent an AIPRO emission rate. The local pool's share of a future injection is its ratio, `10000` out of `10000` while it is the only pool.

Write `totalStaked`, `myStaked`, `pendingCommunity`, `pendingInjected`, and `pool` into the round's `snapshots.ndjson` line. `pool` is the score-staking address from config.

## Withdraw silver stakes score

The send is in [actions.md](actions.md). After the receipt the planet's silver falls, `PlayerScore` rises by the withdrawn chain amount, and the World calls `depositFromGame(player, delta)` on the pool. The delta is the withdrawn amount, not the player's total score. A zero delta does not call the pool.

This call does not move AIPRO. It increases `userStakes` and `totalStaked`. It can be the first stake in the pool. It reverts when the pool has no code, when the World is not a factory admin, or when the pool's community calls fail. Fees on this stack are 0, so the withdraw does not need attached ETH.

## Buy silver injects AIPRO

The send is in [actions.md](actions.md). Approve the payment token to the World for the tier price, then call the World. The World transfers that amount and calls `injectRewards`. The pool splits it across current stakers by stake. The call reverts when `totalStaked` is 0, so a score deposit has to land first.

The whole-token amount counts against the cap in [play.md](play.md). If `balanceOf` is below the price, or the remaining cap is below the price, do not send it. Tell the owner. The local AIPRO supply was minted to the anvil deployer. Do not use that deployer key to mint or transfer unless the owner asks for tokens.

## Claim

Call `claimExternalRewards()` on the pool with value 0. The fee is 0. This pays the injected pending in AIPRO and clears it. It does not pay community pending, and it is not a spend. Skip the call when injected pending is 0. Record it in `actions.ndjson` as `claim`.
