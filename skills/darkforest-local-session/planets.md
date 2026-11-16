# Planet parameters

Read this when a round turns a chain row into a planet object. The names below are the fields in [play.md](play.md). What those numbers do in play is [rules.md](rules.md). Energy, silver, and their caps and growth rates are chain units: the number on the page is the chain unit divided by 1000.

`readAt` is when this wallet read the row. It does not change combat.

## Where the numbers live

`Planet` holds `lastUpdateTick`, `energy` (stored as population), `silver`, and `upgrades`. `upgrades` is three counts packed from the left: range, then speed, then defense. `useProps` is the last byte. `PlanetConstants` holds `perlin`, `level`, `type`, and `spaceType`.

`PlanetProps` is `0x74626466000000000000000000000000506c616e657450726f70730000000000`, keyed by the planet hash. Its static data, from the left, is `uint32 range`, `uint16 speed`, `uint16 defense`, `uint64 energyCap`, `uint32 energyGrowth`, `uint64 silverCap`, `uint32 silverGrowth`.

When `useProps` is true, those stored props are the stats to write on the planet object. When it is false, the planet has not had an upgrade written back. Read `PlanetMetadata` for `(spaceType, planetType, level)` and then apply the two adjustments below before writing `range`, `speed`, `defense`, `energyCap`, `energyGrowth`, `silverCap`, and `silverGrowth`.

`PlanetMetadata` is `0x74626466000000000000000000000000506c616e65744d657461646174610000`. The key is three left-padded bytes: space type, planet type, level. Its static data has the same seven stats as `PlanetProps`, then `uint8 level`, planet type, and space type.

The first adjustment is five independent doubles taken from the planet hash shifted right by 32 bits. Each following byte is used once. A byte below 16 doubles, in order, energy cap, energy growth, range, speed, and defense.

The second adjustment is the upgrade counts. Each upgrade level, in any stat, multiplies energy cap and energy growth by 120/100. Each range level multiplies range by 125/100. Each speed level multiplies speed by 175/100. Each defense level multiplies defense by 120/100. Only a planet of type 1 with level above 0 can be upgraded. One stat can gain at most 4 levels. The total of the three stats can be at most 3 in a nebula, 4 in space, 5 in deep space, and 5 in dead space. The silver spent is 20, 40, 60, 80, then 100 percent of the silver cap for the first through fifth total level purchased.

## Identity

`hash` is the planet id used in every call. `x` and `y` are the secret coordinates. The chain does not store them until someone reveals the planet. Distance is the straight-line distance between two coordinate pairs.

`owner` is who controls the planet in the last write. The zero address means no capture has been written yet. A player call settles a due fleet before it checks this field, so a zero here still allows `df__addJunk` when the off-chain settlement in [rules.md](rules.md) gives this wallet the planet. A capture changes `owner` and does not change `junkOwner`.

`junkOwner` is who is paying the junk quota. `junkCost` is the quota this planet consumes while it has a junk owner: 50, 55, 60, 65, 75, 100, 200, 250, 300, 500 for levels 0 through 9. `addJunkTick` is the stored tick of the last registration. Zero means buy silver still reverts on this planet. Energy, silver, and materials grow only when `owner` and `junkOwner` are the same and the ticker is advancing.

`perlin` is the noise value that chose the space type and the biome. It is not a resource.

`level` is 0 through 9. A higher level has a higher junk cost and, from the metadata, larger caps. Level 0 cannot be upgraded. The home is level 0.

`spaceType` is 1 nebula, 2 space, 3 deep space, 4 dead space. How it scales the stats is [rules.md](rules.md).

## Type

`type` is the planet type.

| type | Name           | What it changes                                                                                                                                                                                                                |
| ---- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Planet         | Energy grows. Silver growth is 0. This is the only type that can be upgraded, and only above level 0. Silver can be bought here. Score cannot be withdrawn here.                                                               |
| 2    | Asteroid field | Materials grow, and only here. The material cap equals `silverCap`. The growth per tick equals `silverGrowth`. The biome chooses the material. The first junk registration initializes those materials. It cannot be upgraded. |
| 3    | Foundry        | The only place `prospect` and `find-artifact` work. Prospect opens a 256-block find window. Find inside it creates the artifact and sets the explored flag. The client calls this type ruins. It cannot be upgraded.           |
| 4    | Spacetime rip  | The only place silver and materials can be withdrawn into score and stake. Buy silver reverts here. Artifact NFTs move in and out only here. The client calls this type a trading post. It cannot be upgraded.                 |
| 5    | Quasar         | A voyage to it uses half the distance. Energy that arrives is cut down to `energyCap`. The client calls this type a silver bank. It cannot be upgraded.                                                                        |

A destroyed planet has the destroyed flag set. Moves and other planet calls revert on it.

## Combat and travel

`energy` is the population on the planet. `energyCap` is the ceiling it grows toward. `energyGrowth` is the logistic rate. A move must leave at least 1 energy on the source. The energy that arrives is the energy sent, divided by `2^(distance / range)`, minus `energyCap / 20`. The range and the energy cap in that formula are the source planet's. If that result is not positive, the move reverts.

`speed` is travel speed. Travel time in ticks is `distance * 100 / speed`. The departure tick is the destination's `lastUpdateTick`. While the ticker is paused, ticks do not pass, so a fleet does not arrive.

`defense` starts near 100. On an attack, the defender loses `arrivedEnergy * 100 / defense`. If that is less than the defender's energy, the defender keeps the planet. If it is not, the attacker takes the planet and keeps `arrivedEnergy - defenderEnergy * defense / 100`, at least 1. A quasar then caps the result at `energyCap`. A fleet from the owner, or from the same guild, adds its energy instead of attacking.

`silver` can be carried by a move and is capped at `silverCap` on arrival. `silverGrowth` adds that much silver per advanced tick, until the cap, on a planet whose stored silver growth is not 0. Bought silver is added immediately and is also capped.

`lastUpdateTick` is the last tick at which this planet applied growth and arrivals. The stored numbers do not include growth since that tick while the clock is paused, because the tick does not move.
