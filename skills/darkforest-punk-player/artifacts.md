# Artifacts

Four artifacts are installed. `artifactIndex` on the artifact is the number below. Rarity is 1 common, 2 rare, 3 epic, 4 legendary, 5 mythic. A level requirement `low..high` means the planet level must be at least `low` and below `high`. Charge time is in stored ticks. While the ticker is paused, a charge that needs 14400 ticks does not become ready.

Sending the calls is in [actions.md](actions.md). This file is what the call changes on the planet.

## Photoid cannon, index 6

Offensive. One use. Charge takes 14400 ticks, then activate, then the artifact breaks and leaves the planet.

Charging multiplies defense by 50, 40, 30, 20, or 10 percent for rarity 1 through 5. The planet is easier to capture until the cannon fires or is shut down.

Activating arms the next move. That move multiplies range by 200 percent and speed by 500, 1000, 1500, 2000, or 2500 percent for rarity 1 through 5. After that move, the range and speed buff and the defense penalty are both removed. No level requirement.

## Wormhole, index 5

Stays on the planet. Activating links this planet to another planet with the same owner. Travel distance between that pair is multiplied by 500, 250, 125, 62, or 31, then divided by 1000, for rarity 1 through 5. A second wormhole on the same pair multiplies again. Shutdown divides that factor back out. No level requirement. The cooldown after shutdown is 14400 ticks.

## Bloom filter, index 4

One use. No charge. Activating sets energy to `energyCap`, then the artifact breaks and leaves the planet. It spends no energy and no silver. The level window is 0..3, 3..5, 5..7, 7..9, or 9..10 for rarity 1 through 5.

## Pink bomb, index 1

Offensive. One use. Charge takes 14400 ticks and records the target coordinates. Activate spends energy, reveals the launcher, and starts the flight. The energy spent is `energyCap / 20` times `2^(distance / range)`. Activating also multiplies the launcher's range by 50 percent and its speed by 50 percent. Landing is the separate `destroy` call in [actions.md](actions.md). A landed hit sets the destroyed flag. The level window starts at 4 for every rarity. The upper bound is 5, 6, 7, 9, or 10 for rarity 1 through 5.
