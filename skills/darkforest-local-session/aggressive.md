# Aggressive

Filename: `aggressive.md`

## Goal

Expand faster. A higher-level planet does that: its range, energy cap, and growth are larger, so the next voyage reaches farther.

## Method

Weigh a planet by how much holding it speeds the next expansion. Level carries the size. A higher level has the larger energy cap, silver cap, and range. Level 0 is the smallest: silver cap 0, range about 99, and it cannot be upgraded.

Among planets that serve the same step, weigh production and position. An asteroid field grows silver and materials. A planet or a foundry grows energy and does not grow silver. A spacetime rip turns silver into stake. A quasar grows neither, and a voyage to it uses half the distance. A planet above level 0 can be range-upgraded. Junk for levels 0 through 9 costs 50, 55, 60, 65, 75, 100, 200, 250, 300, 500. How a voyage arrives is in [planets.md](planets.md). The calls are in [actions.md](actions.md).
