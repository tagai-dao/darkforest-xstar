import {
  EMPTY_ADDRESS,
  MAX_ARTIFACT_TYPE,
  MIN_ARTIFACT_TYPE,
} from "@df/constants";
import { formatNumber, isLocatable } from "@df/gamelogic";
import { getPlanetName, getPlanetNameHash } from "@df/procedural";
import type {
  ArtifactId,
  LocationId,
  MaterialType,
  Planet,
  RevealedCoords,
} from "@df/types";
import { PlanetType } from "@df/types";
import { memo, useEffect, useMemo, useReducer, useState } from "react";
import styled from "styled-components";

import { getPlanetRank } from "../../Backend/Utils/Utils";
import { displayPlayerName, shortAddress } from "../Pages/homeLeaderboard";
import { PlanetThumb } from "../Panes/PlanetDexPane";
import { useUIManager } from "../Utils/AppHooks";
import { getMaterialColor } from "../Utils/materialColor";
import { PlanetLink } from "../Views/PlanetLink";
import { SortableTable } from "../Views/SortableTable";
import { ArtifactHelp } from "./ArtifactHelp";
import { ArtifactImage } from "./ArtifactImage";
import { ArtifactUseActions } from "./ArtifactUseActions";
import {
  GameListPanel,
  ListButton,
  ListEmpty,
  ListTable,
} from "./GameListPanel";
import type { OwnedArtifactLine } from "./ownedArtifacts";

export const PLANET_TYPE_NAME: Record<number, string> = {
  [PlanetType.PLANET]: "行星",
  [PlanetType.SILVER_MINE]: "小行星带",
  [PlanetType.RUINS]: "铸造厂",
  [PlanetType.TRADING_POST]: "时空裂隙",
  [PlanetType.SILVER_BANK]: "类星体",
};

export const MATERIAL_NAME: Record<number, string> = {
  1: "水晶体",
  2: "活木",
  3: "风钢",
  4: "极光金",
  5: "菌胶",
  6: "沙玻璃",
  7: "冰晶石",
  8: "废金",
  9: "火钢",
  10: "黑合金",
  11: "腐化水晶",
};

const TYPE_ORDER = [
  PlanetType.PLANET,
  PlanetType.SILVER_MINE,
  PlanetType.RUINS,
  PlanetType.TRADING_POST,
  PlanetType.SILVER_BANK,
];

type Traffic = { hostile: number; friendly: number };

const Filters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 9px 12px;
  border-bottom: 1px solid #28394e;
`;

const FilterButton = styled(ListButton)`
  background: transparent;
  border-color: #283e55;
  color: #b4c6dc;
  font-size: 12px;

  &[aria-pressed="true"] {
    background: #203b55;
    border-color: #4d7596;
    color: #e2f6ff;
  }

  span {
    margin-left: 5px;
    color: #9dc0db;
  }
`;

const Identity = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 116px;
  color: #edf5ff;
  font-weight: 650;
`;

const Thumbnail = styled.div`
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  place-items: center;
  border: 1px solid #2d435b;
  border-radius: 6px;
  background: #131f31;
`;

const Coordinates = styled.span`
  white-space: nowrap;
  color: #a9bdd5;
  font-size: 12px;
`;

const Tag = styled.span<{ $color?: string }>`
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgb(128 166 207 / 12%);
  color: ${({ $color }) => $color ?? "#b7cce4"};
  font-size: 11px;
  white-space: nowrap;
`;

const StatusList = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
`;

const Muted = styled.span`
  color: #a9bdd5;
  font-size: 12px;
`;

const Resource = styled.span<{ $silver?: boolean }>`
  color: ${({ $silver }) => ($silver ? "#f2d398" : "#e5f4ff")};
  font-weight: 650;
  white-space: nowrap;
`;

const Energy = styled.div`
  display: grid;
  min-width: 76px;
  gap: 4px;

  progress {
    width: 100%;
    height: 4px;
    appearance: none;
    overflow: hidden;
    border: 0;
    border-radius: 4px;
    background: #263a50;
    color: #77c8ef;
  }

  progress::-webkit-progress-bar {
    background: #263a50;
  }

  progress::-webkit-progress-value {
    background: #77c8ef;
  }

  progress::-moz-progress-bar {
    background: #77c8ef;
  }
`;

const PLANET_COLORS: Record<number, string> = {
  [PlanetType.SILVER_MINE]: "#f2d398",
  [PlanetType.RUINS]: "#d0bcff",
  [PlanetType.TRADING_POST]: "#8ee3cf",
  [PlanetType.SILVER_BANK]: "#a5d5ff",
};

/** 这个地址还持有的星球。地址大小写不一致也算同一人。 */
export function heldByAccount(planets: Planet[], account: string): Planet[] {
  const owner = account.toLowerCase();
  return planets.filter(
    (planet) => !planet.destroyed && planet.owner.toLowerCase() === owner,
  );
}

function trafficFor(
  planets: Planet[],
  account: string,
  voyages: { toPlanet: string; player: string; arrivalTick: number }[],
  tick: number,
): Map<string, Traffic> {
  const owned = new Set(planets.map((planet) => String(planet.locationId)));
  const traffic = new Map<string, Traffic>();
  for (const voyage of voyages) {
    const target = String(voyage.toPlanet);
    if (!owned.has(target) || voyage.arrivalTick <= tick) {
      continue;
    }
    const current = traffic.get(target) ?? { hostile: 0, friendly: 0 };
    if (voyage.player.toLowerCase() === account) {
      current.friendly += 1;
    } else {
      current.hostile += 1;
    }
    traffic.set(target, current);
  }
  return traffic;
}

function PlanetStatus({
  planet,
  traffic,
}: {
  planet: Planet;
  traffic?: Traffic;
}) {
  const upgraded = planet.upgradeState.reduce((sum, rank) => sum + rank, 0);
  const materials = (planet.materials ?? []).filter(
    (material) => material.materialId !== 0 && material.materialAmount > 0,
  );
  const hostile = traffic?.hostile ?? 0;
  const friendly = traffic?.friendly ?? 0;
  if (!hostile && !friendly && !upgraded && !materials.length)
    return <Muted>—</Muted>;

  return (
    <StatusList>
      {hostile > 0 && <Tag $color="#ffad9d">来袭 {hostile}</Tag>}
      {friendly > 0 && <Tag $color="#98e7d3">己方航行 {friendly}</Tag>}
      {upgraded > 0 && <Tag $color="#d0bcff">已升级 {upgraded}</Tag>}
      {materials.map(({ materialId, materialAmount }) => (
        <Tag
          key={materialId}
          $color={getMaterialColor(materialId as MaterialType)}
        >
          {MATERIAL_NAME[materialId] ?? "材料"} {formatNumber(materialAmount)}
        </Tag>
      ))}
    </StatusList>
  );
}

function PlanetEnergy({ planet }: { planet: Planet }) {
  const percent =
    planet.energyCap > 0
      ? Math.max(0, Math.round((planet.energy / planet.energyCap) * 100))
      : undefined;
  return (
    <Energy>
      <Resource title={percent === undefined ? undefined : `能量 ${percent}%`}>
        {formatNumber(planet.energy)}
      </Resource>
      {percent !== undefined && (
        <progress
          max={100}
          value={Math.min(percent, 100)}
          aria-label={`能量 ${percent}%`}
        />
      )}
    </Energy>
  );
}

export function OwnedPlanetsPanel({ onClose }: { onClose: () => void }) {
  const uiManager = useUIManager();
  const [planets, setPlanets] = useState<Planet[]>([]);
  const [traffic, setTraffic] = useState<Map<string, Traffic>>(new Map());
  const [category, setCategory] = useState<number | "all">("all");

  useEffect(() => {
    let previous: string | undefined;
    const read = () => {
      const account = uiManager.getAccount()?.toLowerCase();
      if (account) {
        let tick = 0;
        try {
          tick = uiManager.getCurrentTick();
        } catch {
          tick = 0;
        }
        const held = heldByAccount(uiManager.getAllOwnedPlanets(), account);
        const nextTraffic = trafficFor(
          held,
          account,
          uiManager.getAllVoyages().map((voyage) => ({
            toPlanet: String(voyage.toPlanet),
            player: String(voyage.player),
            arrivalTick: voyage.arrivalTick,
          })),
          tick,
        );
        const signature = held
          .map((planet) => {
            const move = nextTraffic.get(String(planet.locationId));
            const materials = (planet.materials ?? [])
              .map(
                ({ materialId, materialAmount }) =>
                  `${materialId}:${materialAmount}`,
              )
              .join(",");
            return [
              planet.locationId,
              isLocatable(planet),
              planet.planetType,
              planet.planetLevel,
              Math.round(planet.energy),
              planet.energyCap,
              Math.round(planet.silver),
              planet.upgradeState.join(","),
              move?.hostile ?? 0,
              move?.friendly ?? 0,
              materials,
            ].join(":");
          })
          .join("|");
        if (signature !== previous) {
          previous = signature;
          setPlanets(held);
          setTraffic(nextTraffic);
        }
      } else if (previous !== "") {
        previous = "";
        setPlanets([]);
        setTraffic(new Map());
      }
    };
    read();
    const timer = window.setInterval(read, 500);
    return () => window.clearInterval(timer);
  }, [uiManager]);

  const counts = new Map<number, number>();
  for (const planet of planets) {
    counts.set(planet.planetType, (counts.get(planet.planetType) ?? 0) + 1);
  }
  const shown =
    category === "all"
      ? planets
      : planets.filter((planet) => planet.planetType === category);

  const headers = ["星球", "坐标", "类型", "等级", "动态与材料", "能量", "银"];
  const alignments: Array<"r" | "c" | "l"> = [
    "l",
    "l",
    "l",
    "r",
    "l",
    "r",
    "r",
  ];
  const columns = [
    (planet: Planet) => (
      <Identity>
        <Thumbnail aria-hidden="true">
          <PlanetThumb planet={planet} />
        </Thumbnail>
        {isLocatable(planet) ? (
          <PlanetLink planet={planet} guideTarget>
            {getPlanetName(planet)}
          </PlanetLink>
        ) : (
          <span>{getPlanetName(planet)}</span>
        )}
      </Identity>
    ),
    (planet: Planet) => (
      <Coordinates>
        {isLocatable(planet)
          ? `(${Math.round(planet.location.coords.x)}, ${Math.round(planet.location.coords.y)})`
          : "坐标未公开"}
      </Coordinates>
    ),
    (planet: Planet) => (
      <Tag $color={PLANET_COLORS[planet.planetType]}>
        {PLANET_TYPE_NAME[planet.planetType] ?? "未知"}
      </Tag>
    ),
    (planet: Planet) => planet.planetLevel,
    (planet: Planet) => (
      <PlanetStatus
        planet={planet}
        traffic={traffic.get(String(planet.locationId))}
      />
    ),
    (planet: Planet) => <PlanetEnergy planet={planet} />,
    (planet: Planet) => (
      <Resource $silver>{formatNumber(planet.silver)}</Resource>
    ),
  ];
  const sortFunctions = [
    (left: Planet, right: Planet) =>
      getPlanetName(left).localeCompare(getPlanetName(right)),
    (left: Planet, right: Planet) => {
      const leftX = isLocatable(left) ? left.location.coords.x : 0;
      const rightX = isLocatable(right) ? right.location.coords.x : 0;
      if (leftX !== rightX) {
        return leftX - rightX;
      }
      const leftY = isLocatable(left) ? left.location.coords.y : 0;
      const rightY = isLocatable(right) ? right.location.coords.y : 0;
      return leftY - rightY;
    },
    (left: Planet, right: Planet) => left.planetType - right.planetType,
    (left: Planet, right: Planet) => right.planetLevel - left.planetLevel,
    (left: Planet, right: Planet) => {
      const leftTraffic = traffic.get(String(left.locationId));
      const rightTraffic = traffic.get(String(right.locationId));
      return (rightTraffic?.hostile ?? 0) - (leftTraffic?.hostile ?? 0);
    },
    (left: Planet, right: Planet) => right.energy - left.energy,
    (left: Planet, right: Planet) => right.silver - left.silver,
  ];

  return (
    <GameListPanel
      title="占领星球"
      count={`${planets.length} 颗`}
      width={830}
      guidePanel="owned-planets"
      guideClose="close-owned-planets"
      onClose={onClose}
      toolbar={
        planets.length > 0 && (
          <Filters role="group" aria-label="按星球类型筛选">
            <FilterButton
              type="button"
              aria-pressed={category === "all"}
              onClick={() => setCategory("all")}
            >
              全部<span>{planets.length}</span>
            </FilterButton>
            {TYPE_ORDER.filter(
              (type) => counts.has(type) || category === type,
            ).map((type) => (
              <FilterButton
                key={type}
                type="button"
                aria-pressed={category === type}
                onClick={() => setCategory(type)}
              >
                {PLANET_TYPE_NAME[type]}
                <span>{counts.get(type) ?? 0}</span>
              </FilterButton>
            ))}
          </Filters>
        )
      }
    >
      {shown.length === 0 ? (
        <ListEmpty>
          {planets.length === 0 ? "暂无占领的星球" : "该类型暂无星球"}
        </ListEmpty>
      ) : (
        <ListTable $minWidth={695}>
          <SortableTable
            rows={shown}
            getRowKey={(planet) => planet.locationId}
            headers={headers}
            columns={columns}
            sortFunctions={sortFunctions}
            alignments={alignments}
          />
        </ListTable>
      )}
    </GameListPanel>
  );
}

const RARITY_ORDER = ["", "未知", "普通", "稀有", "史诗", "传说", "神话"];
const RARITY_COLORS: Record<string, string> = {
  稀有: "#a3d5ff",
  史诗: "#d0bcff",
  传说: "#f3d399",
  神话: "#ffb1d6",
};

const ArtifactLocation = styled.div`
  min-width: 108px;

  button {
    display: grid;
    justify-items: start;
    gap: 2px;
  }
`;

export const RevealedPlanetsPanel = memo(function RevealedPlanetsPanel({
  planets,
  onClose,
}: {
  planets: RevealedCoords[];
  onClose: () => void;
}) {
  const uiManager = useUIManager();
  const game = uiManager.getGameManager();
  const [, refresh] = useReducer((revision: number) => revision + 1, 0);
  const rows = useMemo(
    () =>
      [...planets].sort((left, right) => left.x - right.x || left.y - right.y),
    [planets],
  );

  useEffect(() => {
    const ids = new Set(planets.map(({ hash }) => hash));
    const subscription = game
      .getGameObjects()
      .planetUpdated$.subscribe((id) => {
        if (ids.has(id)) refresh();
      });
    return subscription.unsubscribe;
  }, [game, planets]);

  return (
    <GameListPanel
      title="已公开星球"
      count={`${rows.length} 颗`}
      width={810}
      onClose={onClose}
    >
      {rows.length === 0 ? (
        <ListEmpty>暂无链上公开的星球</ListEmpty>
      ) : (
        <ListTable $minWidth={640}>
          <table>
            <thead>
              <tr>
                <th scope="col">星球</th>
                <th scope="col">坐标</th>
                <th scope="col">类型</th>
                <th scope="col">等级</th>
                <th scope="col">Rank</th>
                <th scope="col">占领者</th>
                <th scope="col">揭示者</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ hash, x, y, revealer }) => {
                const planet =
                  game.getStalePlanetWithId(hash) ??
                  game.getContractAPI().getPlanetById(hash);
                const owner = planet?.owner;
                let ownerName = "—";
                if (owner) {
                  ownerName =
                    owner === EMPTY_ADDRESS
                      ? "未占领"
                      : displayPlayerName(owner, game.getPlayer(owner)?.name);
                }
                return (
                  <tr key={hash}>
                    <td>
                      <Identity>{getPlanetNameHash(hash)}</Identity>
                    </td>
                    <td>
                      <ListButton
                        type="button"
                        onClick={() => uiManager.centerCoords({ x, y })}
                      >
                        ({x}, {y})
                      </ListButton>
                    </td>
                    <td>
                      {planet ? (
                        <Tag $color={PLANET_COLORS[planet.planetType]}>
                          {PLANET_TYPE_NAME[planet.planetType] ?? "未知"}
                        </Tag>
                      ) : (
                        <Muted>—</Muted>
                      )}
                    </td>
                    <td>{planet?.planetLevel ?? "—"}</td>
                    <td>{planet ? getPlanetRank(planet) : "—"}</td>
                    <td>
                      <Muted title={owner}>{ownerName}</Muted>
                    </td>
                    <td>
                      <Muted title={revealer}>{shortAddress(revealer)}</Muted>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ListTable>
      )}
    </GameListPanel>
  );
});

/** 和占领星球同一块弹窗。点位置时，镜头移到放着这件神器的星球。 */
export function OwnedArtifactsPanel({
  artifacts,
  onClose,
}: {
  artifacts: OwnedArtifactLine[];
  onClose: () => void;
}) {
  const uiManager = useUIManager();
  const rows = artifacts.map((line) => {
    const artifact = uiManager.getArtifactWithId(line.id as ArtifactId);
    const body = line.planetId
      ? uiManager.getPlanetWithId(line.planetId as LocationId)
      : undefined;
    const planet = isLocatable(body) ? body : undefined;
    return { line, artifact, planet };
  });

  return (
    <GameListPanel
      title="拥有神器"
      count={`${rows.length} 件`}
      width={920}
      onClose={onClose}
    >
      {rows.length === 0 ? (
        <ListEmpty>暂无拥有的神器</ListEmpty>
      ) : (
        <ListTable $minWidth={600}>
          <SortableTable
            rows={rows}
            getRowKey={({ line }) => line.id}
            headers={["神器", "稀有度", "所在位置", "操作"]}
            columns={[
              ({ line, artifact }) => (
                <Identity>
                  {artifact &&
                    artifact.artifactType >= MIN_ARTIFACT_TYPE &&
                    artifact.artifactType <= MAX_ARTIFACT_TYPE && (
                      <Thumbnail aria-hidden="true">
                        <ArtifactImage artifact={artifact} size={24} />
                      </Thumbnail>
                    )}
                  <span>
                    {line.name}
                    <ArtifactHelp artifactIndex={artifact?.artifactIndex} />
                  </span>
                </Identity>
              ),
              ({ line }) => (
                <Tag $color={RARITY_COLORS[line.rarity]}>
                  {line.rarity || "未知"}
                </Tag>
              ),
              ({ line, planet }) =>
                planet ? (
                  <ArtifactLocation>
                    <PlanetLink planet={planet}>
                      <span>{getPlanetName(planet)}</span>
                      <Coordinates>{line.place}</Coordinates>
                    </PlanetLink>
                  </ArtifactLocation>
                ) : (
                  <Muted>{line.place}</Muted>
                ),
              ({ line, planet, artifact }) => {
                if (line.place === "在钱包")
                  return <Muted>放回星球后可使用</Muted>;
                if (!planet) return <Muted>星球坐标未知</Muted>;
                if (!artifact) return <Muted>神器待同步</Muted>;
                return (
                  <ArtifactUseActions planet={planet} artifact={artifact} />
                );
              },
            ]}
            sortFunctions={[
              (left, right) => left.line.name.localeCompare(right.line.name),
              (left, right) =>
                RARITY_ORDER.indexOf(right.line.rarity) -
                RARITY_ORDER.indexOf(left.line.rarity),
              (left, right) => left.line.place.localeCompare(right.line.place),
              () => 0,
            ]}
            alignments={["l", "l", "l", "l"]}
            sortable={[true, true, true, false]}
          />
        </ListTable>
      )}
    </GameListPanel>
  );
}
