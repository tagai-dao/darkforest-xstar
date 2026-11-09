# Game rules

Read this to decide what a planet, a voyage, or a spend is worth. The strategy file states the goal for the round. This file states what the chain does. How to send a call is [actions.md](actions.md). How to read a planet row is [planets.md](planets.md). The pool addresses are [nutbox.md](nutbox.md).

Energy, silver, materials, and score below are chain units unless a row says display units. The page shows energy, silver, and score divided by 1000.

## 1. What a round can produce

Energy is the means of capture. It grows on a planet and on a foundry. It cannot be withdrawn as score.

Silver grows on an asteroid field. It can also be bought onto a planet, or carried by a fleet. Withdrawing it at a spacetime rip adds the same amount to this wallet's score and to its Nutbox stake.

Materials grow only on an asteroid field. Withdrawing them at a spacetime rip adds `amount × multiplier` to score and to stake. The multipliers are in section 8.

AIPRO paid into the pool, including AIPRO spent to buy silver, is split by stake share. Claiming pays this wallet's pending AIPRO and does not reduce its stake.

A higher-level planet has more range, a higher energy cap, and faster energy growth, so the next voyage can reach farther. Zone and space type change that level and those stats. Junk is the cap on how many planets can be held at once.

## 2. Time

`tickRate` is how many ticks the clock advances for each second of chain time. Read it from the Ticker record every round, together with `tickNumber`, `timestamp`, and `paused`. It is an integer, and it is not fixed at 1. This game can run at one rate, and the next game can run at another. Do not reuse a rate remembered from an earlier round or from this file. The four fields are packed from the left: `uint64 tickNumber`, `uint64 tickRate`, `uint64 timestamp`, and `bool paused`. `paused` is the only pause flag. False means the clock is running.

While `paused` is false, the ticks a call would add are `(block.timestamp - timestamp) * tickRate`, using the `tickRate` and `timestamp` from that same read. Voyage length, energy growth, silver growth, material growth, fleet arrival, and the recall window are counted in ticks. Convert a tick gap to seconds by dividing by this round's `tickRate`. A trip of 100 ticks takes 100 seconds when `tickRate` is 1, and 50 seconds when `tickRate` is 2. A `tickRate` of 0 adds no ticks, so those clocks do not move. While `paused` is true, no ticks are added, whatever the rate is.

`tickNumber` is the last number written into the table. It changes when a call runs tick and writes the record. Until the next write it stays at that number, including while `paused` is false. An unchanged `tickNumber` does not mean the game is paused. Read `paused` for that. The snapshot field `tick` is this stored number. The snapshot also keeps the `tickRate` and `timestamp` from the same read. Keep the elapsed sum out of `tick`.

While `paused` is true, a tick write does not happen. Fleets do not arrive, energy and silver and materials do not grow, and the inner circle does not shrink. A move can still be sent. It waits at the departure tick, which also stays still. Upgrades, junk, and reveals can still be sent. `df__tick` itself reverts while paused. Other planet calls try to tick internally, and that write does nothing while paused.

### Calls settle, then check

The planet tables store the last write. Seconds passing do not update them. A due fleet, grown energy, grown silver, and a shrunk inner circle stay out of those rows until a call settles them. A table read therefore shows the world as of the last write. The page and `planets/*.json` show that same write. Most of the state a call will accept has to be computed off chain before the call is sent.

While `paused` is false, a player call settles in this order:

1. It writes the elapsed ticks onto `tickNumber`. Those ticks are `(block.timestamp - timestamp) * tickRate` from the Ticker read. The tick it settles to is the stored `tickNumber` plus that product.
2. It loads the planet and applies every fleet whose arrival tick is at or before that new tick, then growth up to that tick. Owner, energy, and silver at this step are that result. They are not the row the table read returned.
3. It checks the condition against that result. `df__addJunk` requires the caller to own the planet only after this settlement. Move, upgrade, withdraw, reveal, buy silver, and artifact calls tick and settle before their own checks.
4. It writes the planet back. The next table read shows the new owner only after this write.

Send the call when the off-chain result of step 2 passes step 3. This wallet sends it. A zero `owner` in the stored row means the capture is not persisted yet. When the off-chain result says this wallet will own the planet, `df__addJunk` is the call that persists the capture and registers the junk. A separate `df__tick` only does step 1 and shrinks the inner circle. It leaves the planet row unchanged, so the next table read still shows the old owner.

While `paused` is true, step 1 writes nothing. The call settles only up to the stored tick. A fleet whose arrival tick is still ahead of that stored tick stays in the queue.

The inner circle starts at radius 75000. While the ticker advances, the radius falls by 0.087 each tick. At 0 it stops. Reaching 0 does not end the season, does not zero score, and does not pay anyone. The snapshot field `innerRadius` is the wall for this round.

A season is open while the game pass has a world and a non-zero season number. The pass owner sets that pair, or clears it. Players join the open season with their pass. A later season requires joining again. No score, no radius, and no clock closes the season by itself.

## 3. Map

The map is a disk of radius 100000 around the origin. Zone is the straight-line distance from the origin.

| Distance         | Zone | Level bonus | Zone level cap |
| ---------------- | ---- | ----------- | -------------- |
| below 37500      | 0    | +1          | 9              |
| below 50000      | 1    | 0           | 8              |
| below 62500      | 2    | 0           | 7              |
| below 75000      | 3    | 0           | 6              |
| below 87500      | 4    | 0           | 5              |
| 87500 and beyond | 5    | 0           | 8              |

Space type comes from perlin, except that every planet in zone 4 is nebula. Perlin below 14 is nebula, below 15 is space, below 19 is deep space, and 19 or more is dead space.

A move or a spawn whose destination is closer to the origin than the inner circle reverts. The radius in that check is the one after this call's tick. While `paused` is false, start from the stored radius and subtract 0.087 for each elapsed tick, stopping at 0. Elapsed ticks are `(block.timestamp - timestamp) * tickRate`. A higher `tickRate` shrinks the circle faster in real time. At the start, radius 75000 closes zones 0 through 3. Zone 4 and zone 5 are open. Reveal does not check the circle.

A home can be initialized only in zone 4, and only on a level-0 planet. That planet is nebula. A new wallet therefore starts on the ring outside the closed center.

## 4. Level and base stats

The raw level is the low 24 bits of the planet hash, before any bonus. A value below 100, 500, 4000, 8000, 30000, 65520, 262128, 1048561, or 4194292 is level 9 down through 1. Any larger value is level 0. That last band is most of the map.

Zone 0 then adds 1. A hash that is level 0 anywhere else is at least level 1 in the center, so it has a silver cap and can be upgraded when its type is a planet. The level is then cut by the tighter of the zone cap and the space-type cap. Space-type caps are 4, 5, 9, and 9 for nebula, space, deep space, and dead space. Deep space and dead space reach level 9 only in zone 0. In a nebula the cap is 4, so the center bonus cannot raise a planet past 4 there.

These are the nebula numbers before a space-type scale and before the type adjustments. `silverGrowth` in this table is what an asteroid keeps. A planet, a foundry, a spacetime rip, and a quasar store silver growth 0.

| Level | Range | Speed | Defense | Energy cap | Energy growth | Silver cap | Silver growth | Initial energy |
| ----- | ----- | ----- | ------- | ---------- | ------------- | ---------- | ------------- | -------------- |
| 0     | 99    | 160   | 400     | 100000     | 417           | 0          | 0             | 0%             |
| 1     | 177   | 160   | 400     | 400000     | 833           | 100000     | 56            | 1%             |
| 2     | 315   | 160   | 300     | 1600000    | 1250          | 500000     | 167           | 2%             |
| 3     | 591   | 160   | 300     | 6000000    | 1667          | 2500000    | 417           | 3%             |
| 4     | 1025  | 160   | 300     | 25000000   | 2083          | 12000000   | 833           | 4%             |
| 5     | 1734  | 160   | 200     | 100000000  | 2500          | 50000000   | 1667          | 5%             |
| 6     | 2838  | 160   | 200     | 300000000  | 2917          | 100000000  | 2778          | 7%             |
| 7     | 4414  | 160   | 200     | 500000000  | 3333          | 200000000  | 2778          | 10%            |
| 8     | 6306  | 160   | 200     | 700000000  | 3750          | 300000000  | 2778          | 20%            |
| 9     | 8829  | 160   | 200     | 800000000  | 4167          | 400000000  | 2778          | 25%            |

Space, deep space, and dead space scale range, speed, both caps, and both growth rates by 5/4, 3/2, and 2. Defense is replaced by 1/2, 1/4, and 3/20 of the nebula defense. The initial-energy percentage is multiplied by 4, 10, and 20. Each step uses integer division.

The type then adjusts that result:

| Type | Name           | Adjustment                                                                                                                                                                                                                |
| ---- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Planet         | Space-type defense and silver cap. Silver growth 0. Energy grows. Silver can be bought here.                                                                                                                              |
| 2    | Asteroid field | Defense halved again. Silver cap doubled. Silver growth kept. Initial silver equals the silver cap from before that doubling. Materials use this silver cap as their cap and this silver growth as their growth per tick. |
| 3    | Foundry        | Same stats as the planet. Artifacts are found here.                                                                                                                                                                       |
| 4    | Spacetime rip  | The asteroid's defense and silver cap. Silver growth 0. No initial silver. Score is withdrawn here.                                                                                                                       |
| 5    | Quasar         | From the planet's stats: silver cap ×10, energy cap ×5, speed ×2, energy growth 0. Initial energy is 5/2 of the planet's initial energy at that space type and level, and it does not grow afterward.                     |

After that, five hash bytes can each double one stat. The hash shifted right by 32 bits yields the bytes, in order: energy cap, energy growth, range, speed, defense. A byte below 16 doubles that stat. Upgrades apply after the doubles. Level 0 is always type planet, from the type table, and it cannot be upgraded.

### What each type can do

A type has no extra skill beyond the branches below. There is no attack bonus on a planet. Nothing on a planet pays AIPRO by itself. Level 0 is always a planet, so the other four types appear only at level 1 and above. The next hash byte picks the type. A nebula is mostly planets, with some asteroid fields and either a spacetime rip or a quasar, and no foundry. Space, deep space, and dead space also roll foundries. Deep space and dead space put more of the roll on asteroid fields, spacetime rips, and quasars.

| Type             | Ability only this type has                                                                                                                                                                                                                                                                                                                                                     | What holding it is for                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Planet         | The only type that can be upgraded, and only above level 0. Energy grows. Silver does not.                                                                                                                                                                                                                                                                                     | The fleet source. Range, speed, and defense can be raised here, so later voyages reach farther, arrive sooner, and cost the defender more. Silver can be bought here and then carried out.   |
| 2 Asteroid field | The only type where materials grow. Silver also grows, at `silverGrowth` per tick, up to the doubled silver cap. Defense is half of the space-type defense. The first junk registration initializes the materials. It cannot be upgraded.                                                                                                                                      | The mine. Silver and materials accumulate while the ticker advances, then a fleet can carry them to a spacetime rip. The lower defense makes the same incoming fleet remove more energy.     |
| 3 Foundry        | The only type where `prospect` and `find-artifact` work. Stats match a planet, including energy growth and no silver growth. It cannot be upgraded. Prospect reverts for 256 blocks after a prospect, and finding sets the explored flag so it cannot be found again.                                                                                                          | The artifact source. What those four artifacts change is [artifacts.md](artifacts.md). Until an artifact is found, it is a planet that cannot be upgraded.                                   |
| 4 Spacetime rip  | The only type where silver and materials can be withdrawn into score and stake. Buy silver reverts here. Silver does not grow. Defense and silver cap match an asteroid field, so it can hold a large shipment and is easier to capture than a planet of the same level. Artifact NFT deposit and withdraw also require this type, and both revert until an NFT is configured. | The converter. Silver and materials shipped here become stake. It does not produce them.                                                                                                     |
| 5 Quasar         | A voyage to it uses half the distance. Energy that arrives is cut down to its energy cap, so the extra is lost. Energy does not grow. Speed is double, so a voyage leaving it takes half as many ticks. Silver does not grow. It cannot be upgraded.                                                                                                                           | The relay. Reaching it spends less of the sender's energy, and leaving it is faster. It does not produce energy, silver, or materials, and it cannot be upgraded into a longer-range source. |

Buy silver is allowed on a planet, an asteroid field, a foundry, and a quasar. It is refused on a spacetime rip. The silver still has to fit under that planet's silver cap.

## 5. Junk quota

Space junk is on. Spawn sets this wallet's limit to 1000 and its used junk to 0. The home has an owner and no junk owner until it is registered.

Registering a planet spends quota by level: 50, 55, 60, 65, 75, 100, 200, 250, 300, 500 for levels 0 through 9. Used junk plus that cost must fit under the limit. On success this wallet becomes the junk owner, and the previous junk owner's used junk falls by the same cost. The first registration of an asteroid field initializes its materials.

Clearing junk returns that cost. The caller must be the junk owner. If this wallet also owns the planet, clearing sets the owner to the zero address as well. Energy and silver stay. The planet can be captured by anyone. Clearing a planet someone else owns only returns the quota.

Energy, silver, and materials grow only while the owner and the junk owner are the same wallet and the ticker is advancing. Move, upgrade, withdraw, and buy silver revert while those two differ. A capture changes the owner and leaves the junk owner in place, so the captured planet cannot launch until this wallet registers it. The previous wallet keeps that quota until then, or until it clears.

The limit can be raised. `buy-junk` takes a new allocation from 2 through 1000. The stored limit becomes that allocation times 1000, so the ceiling is 1,000,000. The wallet must already be registered. The cumulative price is 0 at allocation 1, `(allocation - 1) × 0.001 ETH` from 2 through 8, and `0.007 ETH + (allocation - 8)² × 0.001 ETH` from 9 upward. Send the difference between the new price and the current price. A step from 1 to 2 costs 0.001 ETH. Extra ETH is not returned. Ask the owner before the first purchase.

That ETH, the entry fee on other calls, and the 0.005 ETH guild-creation fee all stay in the world contract's `df` namespace balance. `buy-junk` does not record the payment in `RevenueStats`. The namespace owner can later withdraw the whole balance with `GuildSystem.withdraw`. None of it is staked, and none of it is paid to other players.

## 6. Voyage and combat

There is no separate attack stat. The energy that arrives is the attack.

The distance used below is the straight-line distance, then halved when the destination is a quasar, then multiplied by a wormhole factor when one is installed. The factor is `multiplier / 1000` and shortens the distance when the multiplier is below 1000.

The source must keep at least 1 energy. Arrived energy is the energy sent, divided by `2^(distance / range)`, minus `energyCap / 20`. Range and energy cap are the source's. The move reverts when the result is not positive. A larger range wastes less of the same send. A larger source energy cap also raises the flat loss, because the loss is one twentieth of that cap.

Travel time in ticks is `distance × 100 / speed`, using the source's speed. The departure tick is the destination's `lastUpdateTick`. While the ticker is paused, that tick does not move, so the fleet does not arrive.

On an enemy planet, the defender loses `arrivedEnergy × 100 / defense`. Defense 100 removes energy one for one. Defense 400 removes a quarter, so a capture needs arrived energy of at least `defenderEnergy × defense / 100`. If the defender still has energy after that loss, the defender keeps the planet. If not, the attacker takes it and keeps `arrivedEnergy - defenderEnergy × defense / 100`, at least 1. A higher defense makes the same fleet remove less, and leaves the attacker less after a capture. A quasar then caps the resulting energy at its energy cap.

A fleet from the current owner, or from the same guild, adds its arrived energy instead of attacking. Silver on the fleet is added in full and then cut to the destination's silver cap. Materials on the fleet are added in full and then cut to that same cap. Neither silver nor materials change the damage. Only arrived energy does.

A fleet sent to a planet this wallet already holds gathers stock there. The next voyage leaves from that planet, so it uses that planet's range and speed, not the planet that produced the energy. A longer range wastes less energy on the attack. A higher speed makes the attack leg take fewer ticks. Silver gathered there can pay an upgrade first, and that upgrade is what raises the range or speed used by the attack. The gathering voyage has to arrive before the attack can leave, and the departure planet has to be registered by this wallet. The two legs are faster than one direct voyage when the direct voyage would arrive with no energy, or when the forward planet is close to the target and already has the range or speed the producer lacks. They are slower when the forward planet is no closer and no faster, because the first leg still takes its own ticks. A quasar shortens the gathering leg by half and leaves at double speed, and it drops any arrived energy above its own cap.

Unowned level-0 planets start at 0 energy, so any positive arrival captures them. Higher space types raise the initial-energy percentage, so a deep-space or dead-space planet can already hold a large garrison even though its defense is lower.

## 7. Upgrades

Only a type-1 planet above level 0 can be upgraded, and only while this wallet is both the owner and the junk owner. The silver is spent from that planet. The next total upgrade level costs 20, 40, 60, 80, then 100 percent of the silver cap. The call supplies how many extra levels to add in range, speed, and defense, not the new totals.

Every level, in any of the three stats, multiplies energy cap and energy growth by 120/100. Each range level multiplies range by 125/100. Each speed level multiplies speed by 175/100. Each defense level multiplies defense by 120/100. One stat stops at 4. The three together stop at 3 in a nebula, 4 in space, and 5 in deep space or dead space.

The silver spent can no longer be withdrawn. A higher range changes which planets the next send can reach. A higher speed shortens the trip. A higher defense changes the combat in section 6. The larger energy cap also raises the flat loss on later sends from this planet.

## 8. Resources into stake

Growth uses the ticks from the later of `addJunkTick` and `lastUpdateTick`, and only while the owner and the junk owner match. Energy follows a logistic curve toward the energy cap. It does not grow when energy growth is 0, which is the quasar case. Silver grows by `silverGrowth` per tick, up to the silver cap, and does not grow when silver growth is 0. Materials grow by that same `silverGrowth` per tick, up to `silverCap`, and only on an asteroid field.

Buying silver adds it immediately, in display units of 10000, 100000, or 1000000, at AIPRO prices of 10000, 80000, and 600000 whole tokens. The payment is injected into the pool. The call reverts on a spacetime rip, when the junk owner differs, when `addJunkTick` is 0, when the silver would pass the cap, and when the pool's total stake is 0.

Withdrawing silver or materials requires a spacetime rip that this wallet both owns and has registered. The amount must be at least one fifth of the cap: `cap ≤ amount × 5`. For silver the cap is `silverCap`. For a material the cap is also `silverCap`.

Silver withdrawn adds that chain amount to `PlayerScore` and to the pool stake. Materials add the chain amount times the multiplier below, with no further division. The same number is added to the guild's silver counter when this wallet is in a guild. That guild counter is not pool stake.

| Id  | Material          | Page name | Multiplier |
| --- | ----------------- | --------- | ---------- |
| 0   | Unknown           | —         | 100        |
| 1   | Water crystals    | 水晶体    | 105        |
| 2   | Living wood       | 活木      | 110        |
| 3   | Wind steel        | 风钢      | 120        |
| 4   | Aurorium          | 极光金    | 130        |
| 5   | Mycelium          | 菌胶      | 150        |
| 6   | Sand glass        | 沙玻璃    | 180        |
| 7   | Cryostone         | 冰晶石    | 200        |
| 8   | Scrapium          | 废金      | 250        |
| 9   | Pyrosteel         | 火钢      | 300        |
| 10  | Blackalloy        | 黑合金    | 400        |
| 11  | Corrupted crystal | 腐化水晶  | 600        |

Dead space is the corrupted biome and grows blackalloy and corrupted crystal. Other space types grow one material. Nebula is water crystals, living wood, or wind steel. Space is aurorium, mycelium, or sand glass. Deep space is cryostone, scrapium, or pyrosteel. Which of the three depends on the biome base: below 15 the first, below 17 the second, otherwise the third.

A zero delta does not call the pool. The pool receives the increment, not the cumulative `PlayerScore`.

## 9. The pool

`depositFromGame` adds the increment to this wallet's stake and to the total. There is no decrease, no expiry, and no season argument. Pending injected AIPRO is this wallet's share of what has been injected since its last update. Pending community AIPRO is its share of the community release. On this local community the calculator has no release, so that pending stays 0. `claimExternalRewards` pays the injected pending and leaves the stake in place. Community rewards are claimed from the community contract.

Buying silver is an injection. It is split by the stake already in the pool, including this wallet's own stake. A wallet that holds the whole stake is paid its own injection back when it claims, minus nothing in the local fee configuration, because the committee fees are 0.

Changing the pass to a new season does not read the pool. Stake and unclaimed rewards stay where they are. A new world starts its own `PlayerScore` at 0. If that world still points at this pool, the next withdraw adds a new increment on top of the old stake. One claim pays the whole pending balance. The pool does not keep a separate balance per season.

The agreed later change is not in the live pool. When it is added, a new season will make every effective stake 0 without deleting the AIPRO already owed, and one claim will still pay every season's unpaid balance together. Until that code is deployed, read `getUserStakedAmount` and do not treat a new season number as a wiped stake.

## 10. Where the other rules are

Artifacts change one planet's defense, range, speed, or energy, or reveal and destroy planets in a window. The installed four are [artifacts.md](artifacts.md). A cannon weakens defense while it charges, then buffs the next move. A wormhole shortens distance. A bloom filter fills energy to the cap and breaks. A pink bomb reveals the launcher and can destroy planets in a radius.

A guild lets members reinforce each other instead of fighting. Creating one costs 0.005 ETH and that ETH follows the junk payment into the namespace balance. Ask the owner before the first guild purchase. The twelve calls are in [actions.md](actions.md).

Reveal publishes coordinates. The cooldown is 14400 stored ticks. A reveal does not move energy, silver, or stake. Recall is allowed during the first half of a trip and returns a fleet with half the energy and half the silver. While the ticker is paused at 0, a fleet sent at tick 0 can be recalled. Both calls are in [actions.md](actions.md).
