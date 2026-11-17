# Home planet

A staked wallet still cannot play until it has a home. Staking the AIPRO NFT does not create one. A home exists when `SpawnPlanet` for this wallet is not zero and `homeLocations.json` contains that planet hash.

A wallet in the season whose `SpawnPlanet` is zero has no home yet. Search for one. Do not treat another wallet's stopped search as this wallet's stop. Entry is the AIPRO NFT stake in [SKILL.md](SKILL.md). Do not treat an older pass as joined.

Do this before [mining.md](mining.md). Do not mine from `0, 0`. The center of the map is inside the inner circle, and a home there is rejected.

## Read the chain

Use the world `0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f` and Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11` from `SKILL.md`. Set both `NO_PROXY=127.0.0.1,localhost` and `no_proxy=127.0.0.1,localhost`. Read these three tables in one `aggregate3`. Do not send a separate `eth_call` for each table. `allowFailure` is false. Do not send ETH to Multicall3.

| Table       | Id                                                                   |
| ----------- | -------------------------------------------------------------------- |
| SpawnPlanet | `0x74626466000000000000000000000000537061776e506c616e65740000000000` |
| Player      | `0x74626466000000000000000000000000506c6179657200000000000000000000` |
| InnerCircle | `0x74626466000000000000000000000000496e6e6572436972636c650000000000` |

`<key>` is the player address padded on the left to 32 bytes. `cast to-bytes32` pads on the right and is the wrong key. Use:

```bash
cast abi-encode "x(address)" <player>
```

```bash
export NO_PROXY=127.0.0.1,localhost
export no_proxy=127.0.0.1,localhost
RPC=http://127.0.0.1:8545
MULTI=0xcA11bde05977b3631167028862bE2a173976CA11
WORLD=0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f
KEY=$(cast abi-encode "x(address)" <player>)
SPAWN=$(cast calldata "getRecord(bytes32,bytes32[])" 0x74626466000000000000000000000000537061776e506c616e65740000000000 "[$KEY]")
PLAYER_REC=$(cast calldata "getRecord(bytes32,bytes32[])" 0x74626466000000000000000000000000506c6179657200000000000000000000 "[$KEY]")
CIRCLE=$(cast calldata "getRecord(bytes32,bytes32[])" 0x74626466000000000000000000000000496e6e6572436972636c650000000000 "[]")

cast call $MULTI \
  "aggregate3((address,bool,bytes)[])((bool,bytes)[])" \
  "[($WORLD,false,$SPAWN),($WORLD,false,$PLAYER_REC),($WORLD,false,$CIRCLE)]" \
  --rpc-url $RPC
```

The three results are SpawnPlanet, Player, then InnerCircle. Each `returnData` is the ABI encoding of `getRecord`: static bytes, one length word, then dynamic bytes.

- SpawnPlanet static data is one `uint256`. Zero means this wallet has no home. Any other value is the home planet hash. Do not call `initializePlayer` again.
- Player static data is the burner address (20 bytes), then the player index (`uint32`), then `createdAt` (`uint64`), all big-endian and packed from the left. An empty record, or an index of zero, means the wallet is not registered. Spawn reverts until it is registered.
- InnerCircle static data is three `uint64` values: `radius`, `radiusx1000`, `speed`. The first value is the live inner radius. It starts at `75000`.

## What counts as a home

The contract, not the map center, decides. A coordinate is a legal home only when every line below is true.

- It is a planet: its MiMC hash, key `1729`, is below `LOCATION_ID_UB / 16384`.
- Let `distanceSquare` be `x * x + y * y`. It is at least `75000 * 75000`, and at least `innerRadius * innerRadius`. It is below `100000 * 100000`.
- Zone comes from the borders `[37500, 50000, 62500, 75000, 87500]`. Walk them in order and take the first border whose square is strictly greater than `distanceSquare`. If none matches, the zone is `5`. Zone `4` is the band above `75000` through `87500`.
- Space Perlin uses key `1730`, scale `8192`, neither axis mirrored, `floor` true. Spawn Perlin must be at least `1` and below `31`. Zone `4` is always nebula. Zone `5` is nebula only when that Perlin is below `14`. Any other zone is not a home, even when the inner circle has shrunk.
- Level is the lowest 24 bits of the planet hash. The level thresholds are `[100, 500, 4000, 8000, 30000, 65520, 262128, 1048561, 4194292]`. When the 24-bit value is below one of them, the level is not zero. A home needs that value to be at least `4194292`, so the level stays `0`. Zone `4` and zone `5` add no level bonus.
- A level-0 nebula planet is type planet. The type byte does not need a separate test.

Start the spiral inside the legal home band: distance at least the live inner radius, which starts at `75000`, and below `100000`, and only zone `4` or zone `5`. Pick one center in that band and spiral from there. Generate a bounded set of legal candidates, then read their `PlanetOwner` records through verified Multicall3 `aggregate3` at one fixed block. Keep the result in candidate order and reject the whole batch if a required subcall fails. Select the first unowned candidate. Ownership is this read. Do not skip a coordinate because another wallet once owned a neighbor. If the current batch has no unowned candidate, continue the spiral with another bounded batch and a new fixed-block snapshot.

Do not send a loop of individual `eth_call`, a JSON-RPC batch, or `Promise.all` of contract reads for ownership. If the node limits the batch, split it into smaller Multicall3 calls pinned to the same block. Prove only after ownership has been checked. Stop active workers immediately when the owner says stop; clean up temporary scripts and do not submit a spawn transaction.

## Create the home, then ask about mining

Finding the coordinate does not spend tokens. Once one unowned legal coordinate is known, generate its proof and create the home. A wallet that already has a player record keeps that name. Do not register it again. The burner is the same wallet. Do not create or store a second key.

If the player index is zero, ask the owner what name to register. Wait for that name. Do not invent one, and do not use `pilot` plus part of the address. The question is only the name. An example: "What name should this new player use?" If registration reverts because that name is taken, say so and ask for a different name. Do not append a number unless the owner gives that new name.

If the ETH balance cannot pay for the register and spawn transactions, stop and tell the owner. Do not search further and do not write the home files.

Sign with the current wallet. A legacy transaction is fine. Wait for each receipt. Call the world. Staking is the locker call in [SKILL.md](SKILL.md), not a world call.

1. If the player index is zero, call `df__registerPlayer(string,address)` with the name the owner just gave and the player address. If it reverts because the wallet is already registered, continue.
2. Prove the candidate with the example below. The world requires this proof.
3. Call `df__initializePlayer(uint256[2],uint256[2][2],uint256[2],uint256[9])` with the `a`, `b`, `c`, and nine public signals printed by the example.

If spawn reverts because that planet is already owned, or because it is not a legal home, discard that center, draw a new point, and search again. Do not continue the old spiral and do not retry the same coordinate. If it reverts because this wallet already spawned, stop. If it reverts because this wallet has not staked for this season, return to the stake step in `SKILL.md`.

After the spawn receipt succeeds, write the wallet folder's `homeLocations.json`. The hash is 64 lowercase hex characters and has no `0x` prefix. `perlin` is the space Perlin. `biomebase` uses key `1731` and `floor` true. The numbers below only show the file shape. Write the coordinate that just spawned.

```json
[
  {
    "coords": { "x": 80012, "y": 3 },
    "hash": "<64 hex characters>",
    "perlin": 12,
    "biomebase": 9
  }
]
```

Keep every side-16 square whose 256 coordinates were hashed. The square that contains the chosen home is one of them: finish that square, and list every planet in it, not only the home. A square left unfinished, or skipped because its nearest corner is outside the search band, is not a mined chunk.

After a successful spawn receipt, append each fully mined square once to `knownBoard.ndjson`, in the line shape from [mining.md](mining.md), and write `homeLocations.json`. Read `SpawnPlanet` again. The home is ready only when that value is not zero, `homeLocations.json` exists, and the home chunk is in the log.

The reply that reports those coordinates also asks what to do next. Include the page address, the wallet folder, and the `打开钱包目录` button. Ask whether to start mining from that home, with the choices in [mining.md](mining.md), and which strategy file starts play: `aggressive.md`, `conservative.md`, `offensive.md`, or `profit.md`. One question, then wait. Do not start the first ring or write `strategy.txt` before they answer. A yes to mining uses the mining defaults for any choice they left out. The strategy name they give is the one line in `strategy.txt`. After both answers are in that reply, mine, then play from [play.md](play.md). Do not end the turn with only "the home is created."

## Implementation notes

Use a temporary TypeScript script from `packages/client` to iterate `SpiralPattern` around the selected center. Use `mimcHash(1729)` and `perlin` from `src/Shared/hashing`, and apply the legal-home checks above. Bound each search pass to a small number of candidates or chunks and print progress; avoid an unbounded worker pool. Delete the temporary script after the search stops. Keep private keys out of the script.

For ownership, encode `getRecord(bytes32,bytes32[])` for the `PlanetOwner` table (`0x74626466000000000000000000000000506c616e65744f776e65720000000000`) with each candidate hash as its sole key. Call verified Multicall3 `aggregate3((address target,bool allowFailure,bytes callData)[])` at `0xcA11bde05977b3631167028862bE2a173976CA11`, with every target set to the World, `allowFailure=false`, and the same `blockNumber` for all shards. Decode each `getRecord` result as `(bytes staticData,bytes32 encodedLengths,bytes dynamicData)`. The owner is the first 20 bytes of `staticData`; an empty record is the zero address. Check the Multicall3 code and chain ID before using it.

Once an unowned candidate is selected, generate the `init` Groth16 proof with `src/Shared/snarks/init.wasm`, `init.zkey`, and `public/snarkjs.min.js`. Supply `x`, `y`, `r=floor(hypot(x,y))+1`, `PLANETHASH_KEY=1729`, `SPACETYPE_KEY=1730`, `SCALE=8192`, `xMirror=0`, `yMirror=0`, and `targetDistFromOriginSquare=x*x+y*y` as decimal strings. Normalize negative coordinates with `modPBigInt`. When loading the bundled browser prover in Node's `vm` context, expose the host `Uint8Array` and apply the compatibility replacement below; otherwise `fullProve` can fail with `Invalid FastFile type: undefined`.

```ts
context.Uint8Array = Uint8Array;
vm.runInContext(
  readFileSync("public/snarkjs.min.js", "utf8").replace(
    "async function De(t, e) {",
    "async function De(t, e) { t = true;",
  ),
  context,
);
```

Reverse the two inner `pi_b` pairs for the contract. Simulate `df__initializePlayer(uint256[2],uint256[2][2],uint256[2],uint256[9])` from this wallet before signing; submit only when simulation succeeds. Wait for a successful receipt, then record its chain block timestamp as `time` and transaction hash as `tx`. Never log an unsubmitted proof or a failed transaction as an action. Save the home and finished map chunks only after that receipt.
