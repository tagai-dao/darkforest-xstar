# Nutbox score pool

Score withdrawals stake into this pool. The unburned part of a buy-silver payment is injected here and split by stake. Read the pool from the chain before either action. A missing contract stops the action. For any buy, verify the current spender and quote using the purchase preflight below.

`DFXStarConfig` is the source of the pool addresses and the burn ratio. Its table id is in [play.md](play.md). Static data is packed from the left:

1. `scoreStakingPool`, 20 bytes
2. `paymentToken`, 20 bytes
3. `stakingFactory`, 20 bytes
4. `community`, 20 bytes
5. `buySilverSystem`, 20 bytes. Compare this field with the World system registry and use the verified system as the allowance target.
6. `burnBps`, 2 bytes, big-endian `uint16`. 5000 burns half. 0 injects the whole payment. 10000 burns the whole payment.

`DFXStarConfig` on this world is:

| Role            | Address                                      |
| --------------- | -------------------------------------------- |
| Pool            | `0x375dED0C49aEb8DdD3E9DB6A4b5c84A0adD93C9F` |
| Staking factory | `0xd436Bb8fF9BdF45b85aAC0dB038F14a9Ad14610B` |
| Community       | `0xfB710BE94918e999877b55003173C04375774d46` |
| Payment token   | `0x935FB3D106c259840d4abE96351867fb63123333` |
| BuySilverSystem | `0x43e4CF86Bc12D46dEb64ca3836A5aEb11E4566df` |

The community address is a contract. Do not send AIPRO to it as if it were a wallet. The pool stores this World once and cannot change it. `depositFromGame` accepts only that World. Do not call `addAdmin`, `removeAdmin`, or fee setters. Do not mint AIPRO.

## Read before a score or a buy

For the score and reward summary, use on-chain Multicall3 `aggregate3` with `allowFailure=false` and addresses from `DFXStarConfig`. Pin the config and dependent reads to one block. For any buy transaction, also run the full purchase preflight below.

| Call                                       | What it decides                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Pool code size                             | `0` means the pool is not there. Stop. Do not deploy one                                    |
| Pool `world()`                             | Must equal the World `0xfaD1cDDAD97113e4c0335FF5A815955c21b2ddca`. This is the bound scorer |
| Factory `poolOfWorld(world)`               | Must equal the pool. A second pool for the same World cannot be created                     |
| Pool `getTotalStakedAmount()`              | A buy with a non-zero remainder reverts while this is 0. `burnBps` 10000 does not           |
| Pool `getUserStakedAmount(player)`         | This wallet's score stake                                                                   |
| Pool `getPendingAllRewards(player)`        | Two `uint256` words: community pending, then injected pending                               |
| Token `balanceOf(player)`                  | This wallet's AIPRO. Score staking does not transfer it                                     |
| Token `allowance(player, buySilverSystem)` | Compare existing allowance with the price after verifying the actual spender                |

`getPendingAllRewards` does not pay the wallet. Read both numbers from the pool. Do not invent an AIPRO emission rate. The unburned part of a buy-silver payment is injected into the pool and split by stake. The burned part is not in that pending balance. Both are separate from the community release.

Write `totalStaked`, `myStaked`, `pendingCommunity`, `pendingInjected`, and `pool` into the round's `snapshots.ndjson` line. `pool` is the score-staking address from config.

## Withdraw silver stakes score

The send is in [actions.md](actions.md). After the receipt the planet's silver falls, `PlayerScore` rises by the withdrawn chain amount, and the World calls `depositFromGame(player, delta)` on the pool. The delta is the withdrawn amount, not the player's total score. A zero delta does not call the pool.

The withdraw system does not call the pool itself. It calls the root system `StakeScoreSystem`, which runs inside the World, so the pool sees the World as the caller. That caller must equal `pool.world()`. Do not add the withdraw systems as admins. A player calling `StakeScoreSystem` does not stake. Material withdrawal uses the same call.

This call does not move AIPRO. It increases `userStakes` and `totalStaked`. It can be the first stake in the pool. It reverts when the pool has no code, when `pool.world()` is not this World, or when the pool's community calls fail. Send it with no BNB attached. `pool.world()` is `0xfaD1cDDAD97113e4c0335FF5A815955c21b2ddca`.

## Verify a buy before signing

Use the skill bundle's executable check before approval and purchase. It uses Node.js and Foundry's `cast` to read chain state and returns the verified quote and allowance as JSON.

```sh
node check-buy-silver.mjs --player "$active_signer_address" \
  --signer-chain-id "$live_wallet_chain_id" --order-file "$order_file"
```

Set `active_signer_address` and `live_wallet_chain_id` from the connected signer. The order file contains the `DARKFOREST_BUY_SILVER` tag and its JSON. Use the helper's `--rpc` option only with another trusted HTTPS BSC provider. For a strategy buy, use the same order format with the strategy's chosen tier and authorized quote.

The trusted deployment is the BSC chain and World named in [SKILL.md](SKILL.md). Resolve them independently of the clipboard, wallet save, page URL, or a previous run. Require chain ID `56` on the selected RPC and use it as the signing chain for the currently connected player account. If a pasted order's numeric `chainId` or `worldAddress` differs from this deployment, stop. Validate the order kind, call, decimal planet hash, integer tier from 0 to 3, and decimal amount fields before using them.

Select one block number for the entire snapshot. Check bytecode for the trusted World and the chain's verified Multicall3 at that block. For the chain-56 Multicall3 address from the skill, compare the runtime bytecode hash with the repository's known Multicall3 runtime hash `0xd5c15df687b16f2ff992fc8d767b4216323184a2bbc6ee2f9c398c318e770891`. Use on-chain Multicall3 `aggregate3((address target,bool allowFailure,bytes callData)[])` with `allowFailure=false` for every required subcall. Keep the declared targets and result order, and pin both dependent stages and any split or retry to the same block. A missing, malformed, or failed result stops the buy. Use only smaller pinned Multicalls if a batch exceeds a node limit.

1. Read the trusted World's `DFXStarConfig` and `EntryFee` singleton records, its registered `BuySilverSystem` from the `Systems` table, and its `df__quoteBuySilver(uint256 planetHash,uint8 tier)` result. For these table calls use `getRecord(bytes32,bytes32[])`. The `Systems` table ID is `0x7462776f726c6400000000000000000053797374656d73000000000000000000`, and its sole key for this lookup is `0x7379646600000000000000000000000042757953696c76657253797374656d00`. The first 20 bytes of that record's static data are the registered system. The helper also checks that the trusted World routes both the purchase and quote selectors to this system. The `EntryFee` table ID is `0x74626466000000000000000000000000456e7472794665650000000000000000`; use the empty key tuple and decode the fee as one big-endian uint256.
2. Require the registered spender to equal the config's `buySilverSystem`. Confirm the spender and payment token have code at the same block. Then, in a second Multicall at that block, read the spender's `trustedWorld()` and the verified payment token's `balanceOf(player)` and `allowance(player, registeredSpender)`. The spender must report the trusted World. An older system without this binding is unavailable for purchases.
3. Compare the proposed token and spender with these verified addresses. The World quote returns `(priceWei, silverChainUnits)`. Check the order's `priceWei` against the quoted wei, `priceWhole` against the quoted whole-token amount, and `silverDisplay` against the quoted silver divided by 1000. Check `entryFeeWei` against the world's live fee. Use exact integer arithmetic. The balance must cover the verified price and a strategy buy must stay within its existing cap.

Only after all stages agree may the player wallet grant an exact allowance to the registered spender if needed. Refresh the full check on one newly pinned block after any approval receipt and before signing the purchase. If the selection or verified values differ, stop and report it. If the approval succeeded and the purchase stops, disclose the allowance granted by this order to the owner.

## Buy silver burns, then injects the remainder

The send is in [actions.md](actions.md). The verified on-chain quote determines the price to approve. Call the trusted World `df__buySilver` after the checks above. The `df` system is a normal call, so the registered `BuySilverSystem` pulls the full price. It sends `price × burnBps / 10000`, rounded down, to `0x000000000000000000000000000000000000dEaD`, then calls `injectRewards` with the remainder. The pool splits that remainder across current stakers by stake. When the remainder is above 0, the call reverts while `totalStaked` is 0, so a score deposit has to land first. When `burnBps` is 10000 the remainder is 0, `injectRewards` is not called, and no stake is required. A score deposit is different: only the World, through the root `StakeScoreSystem`, may call `depositFromGame`. The namespace owner changes the ratio with `df__updateSilverBurnBps`. Values above 10000 revert. Rewriting the pool addresses with `df__setDFXStarConfig` leaves `burnBps` as it is.

The whole-token amount counts against the cap in [play.md](play.md). If `balanceOf` is below the price, or the remaining cap is below the price, do not send it. Tell the owner. Do not mint AIPRO and do not spend another account's tokens.

## Claim

Call `claimExternalRewards()` on the pool with no BNB attached. This pays the game-reward pending in AIPRO and clears it. It does not pay community pending, and it is not a spend. Skip the call when injected pending is 0. Record it in `actions.ndjson` as `claim`.

Community rewards are separate. `HourlyTickCalculator.inject(community, amount)` pulls AIPRO into the community and vests it across 168 hours. The player's share is `getPendingCommunityRewards`. Call `withdrawPoolsRewards` on the community with the score pool as the only address and no BNB attached. Skip the call when that pending is 0. Record it as `claim-community`.
