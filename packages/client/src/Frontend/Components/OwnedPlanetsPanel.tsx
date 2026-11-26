import { formatNumber, isLocatable } from "@df/gamelogic";
import { getPlanetName } from "@df/procedural";
import type { ArtifactId, LocationId, Planet } from "@df/types";
import { PlanetType } from "@df/types";
import { useEffect, useState } from "react";
import styled from "styled-components";

import { PlanetThumb } from "../Panes/PlanetDexPane";
import dfstyles from "../Styles/dfstyles";
import { useUIManager } from "../Utils/AppHooks";
import { PlanetLink } from "../Views/PlanetLink";
import { SortableTable } from "../Views/SortableTable";
import { ArtifactHelp } from "./ArtifactHelp";
import { ArtifactUseActions } from "./ArtifactUseActions";
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

const Shell = styled.div`
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 7;
  width: min(760px, calc(100vw - 420px));
  max-height: calc(100vh - 32px);
  overflow: auto;
  padding: 12px;
  background: ${dfstyles.colors.background};
  color: ${dfstyles.colors.text};
  border: 1px solid ${dfstyles.colors.borderDark};
`;

const TitleRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const Filters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
`;

const FilterButton = styled.button<{ active: boolean }>`
  cursor: pointer;
  color: ${dfstyles.colors.text};
  background: ${({ active }) =>
    active ? dfstyles.colors.backgroundlighter : "transparent"};
  border: 1px solid ${dfstyles.colors.borderDark};
  padding: 4px 8px;
`;

const CloseButton = styled.button`
  cursor: pointer;
  color: ${dfstyles.colors.text};
  background: transparent;
  border: 1px solid ${dfstyles.colors.borderDark};
  padding: 4px 8px;
`;

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

function statusText(planet: Planet, traffic: Traffic | undefined): string {
  const parts: string[] = [];
  if (planet.energyCap > 0) {
    const percent = Math.min(
      100,
      Math.round((planet.energy / planet.energyCap) * 100),
    );
    parts.push(percent >= 98 ? `能量满 ${percent}%` : `成长 ${percent}%`);
  }
  const upgraded = planet.upgradeState.reduce((sum, rank) => sum + rank, 0);
  if (upgraded > 0) {
    parts.push(`已升级 ${upgraded}`);
  }
  if (traffic && traffic.hostile > 0) {
    parts.push(`来袭 ${traffic.hostile}`);
  }
  if (traffic && traffic.friendly > 0) {
    parts.push(`己方航行 ${traffic.friendly}`);
  }
  const materials = planet.materials.filter(
    (material) => material.materialId !== 0 && material.materialAmount > 0,
  );
  if (materials.length > 0) {
    parts.push(
      materials
        .map((material) => MATERIAL_NAME[material.materialId] ?? "材料")
        .join("/"),
    );
  }
  return parts.join(" ");
}

export function OwnedPlanetsPanel({ onClose }: { onClose: () => void }) {
  const uiManager = useUIManager();
  const [planets, setPlanets] = useState<Planet[]>([]);
  const [traffic, setTraffic] = useState<Map<string, Traffic>>(new Map());
  const [category, setCategory] = useState<number | "all">("all");

  useEffect(() => {
    let stopped = false;
    let previous = "";
    const read = () => {
      if (stopped) {
        return;
      }
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
            return `${planet.locationId}:${Math.round(planet.energy)}:${Math.round(planet.silver)}:${move?.hostile ?? 0}:${move?.friendly ?? 0}`;
          })
          .join("|");
        if (signature !== previous) {
          previous = signature;
          setPlanets(held);
          setTraffic(nextTraffic);
        }
      }
      // 数字没变就不重画。变了就在下一帧继续看。
      requestAnimationFrame(read);
    };
    read();
    return () => {
      stopped = true;
    };
  }, [uiManager]);

  const counts = new Map<number, number>();
  for (const planet of planets) {
    counts.set(planet.planetType, (counts.get(planet.planetType) ?? 0) + 1);
  }
  const shown =
    category === "all"
      ? planets
      : planets.filter((planet) => planet.planetType === category);

  const headers = ["", "名称", "坐标", "类型", "等级", "状态", "能量", "银"];
  const alignments: Array<"r" | "c" | "l"> = [
    "c",
    "l",
    "l",
    "l",
    "r",
    "l",
    "r",
    "r",
  ];
  const columns = [
    (planet: Planet) => <PlanetThumb planet={planet} />,
    (planet: Planet) =>
      isLocatable(planet) ? (
        <PlanetLink planet={planet} guideTarget>
          {getPlanetName(planet)}
        </PlanetLink>
      ) : (
        <span>坐标未公开</span>
      ),
    (planet: Planet) =>
      isLocatable(planet)
        ? `(${Math.round(planet.location.coords.x)}, ${Math.round(planet.location.coords.y)})`
        : "未知",
    (planet: Planet) => PLANET_TYPE_NAME[planet.planetType] ?? "未知",
    (planet: Planet) => planet.planetLevel,
    (planet: Planet) =>
      statusText(planet, traffic.get(String(planet.locationId))),
    (planet: Planet) => formatNumber(planet.energy),
    (planet: Planet) => formatNumber(planet.silver),
  ];
  const sortFunctions = [
    () => 0,
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
    <Shell data-guide-panel="owned-planets">
      <TitleRow>
        <div>占领星球 {planets.length}</div>
        <CloseButton
          type="button"
          data-guide-target="close-owned-planets"
          onClick={onClose}
        >
          关闭
        </CloseButton>
      </TitleRow>
      <Filters>
        <FilterButton
          type="button"
          active={category === "all"}
          onClick={() => setCategory("all")}
        >
          全部 {planets.length}
        </FilterButton>
        {TYPE_ORDER.filter((type) => (counts.get(type) ?? 0) > 0).map(
          (type) => (
            <FilterButton
              key={type}
              type="button"
              active={category === type}
              onClick={() => setCategory(type)}
            >
              {PLANET_TYPE_NAME[type]} {counts.get(type)}
            </FilterButton>
          ),
        )}
      </Filters>
      {shown.length === 0 ? (
        <div>这一类还没有星球。</div>
      ) : (
        <SortableTable
          key={category}
          rows={shown}
          headers={headers}
          columns={columns}
          sortFunctions={sortFunctions}
          alignments={alignments}
        />
      )}
    </Shell>
  );
}

const RARITY_ORDER = ["", "未知", "普通", "稀有", "史诗", "传说", "神话"];

/** 和占领星球同一块弹窗。点位置时，镜头移到放着这件神器的星球。 */
export function OwnedArtifactsPanel({
  artifacts,
  onClose,
}: {
  artifacts: OwnedArtifactLine[];
  onClose: () => void;
}) {
  const uiManager = useUIManager();
  const place = (line: OwnedArtifactLine) => {
    if (!line.planetId) return line.place;
    const planet = uiManager.getPlanetWithId(line.planetId as LocationId);
    if (!planet || !isLocatable(planet)) return line.place;
    return <PlanetLink planet={planet}>{line.place}</PlanetLink>;
  };
  // 名称后面跟一个“？”，悬浮看这件神器的作用和用法。
  // 神器编号从已同步的神器里取，不放进 line，免得改动列表数据的结构。
  const nameWithHelp = (line: OwnedArtifactLine) => {
    const artifact = uiManager.getArtifactWithId(line.id as ArtifactId);
    return (
      <>
        {line.name}
        <ArtifactHelp artifactIndex={artifact?.artifactIndex} />
      </>
    );
  };
  // 在钱包里的神器先存回星球才能充能或激活。
  const use = (line: OwnedArtifactLine) => {
    if (!line.planetId) return "在钱包，先放回星球";
    const planet = uiManager.getPlanetWithId(line.planetId as LocationId);
    if (!planet || !isLocatable(planet)) return "坐标还未知";
    const artifact = uiManager.getArtifactWithId(line.id as ArtifactId);
    if (!artifact) return "神器还没同步";
    return <ArtifactUseActions planet={planet} artifact={artifact} />;
  };

  return (
    <ArtifactShell>
      <TitleRow>
        <div>拥有神器 {artifacts.length}</div>
        <CloseButton type="button" onClick={onClose}>
          关闭
        </CloseButton>
      </TitleRow>
      {artifacts.length === 0 ? (
        <div>还没有神器。</div>
      ) : (
        <SortableTable
          rows={artifacts}
          headers={["名称", "稀有度", "位置", "使用"]}
          columns={[
            (line) => nameWithHelp(line),
            (line) => line.rarity || "未知",
            (line) => place(line),
            (line) => use(line),
          ]}
          sortFunctions={[
            (left, right) => left.name.localeCompare(right.name),
            (left, right) =>
              RARITY_ORDER.indexOf(right.rarity) -
              RARITY_ORDER.indexOf(left.rarity),
            (left, right) => left.place.localeCompare(right.place),
            () => 0,
          ]}
          alignments={["l", "l", "l", "l"]}
          sortable={[true, true, true, false]}
        />
      )}
    </ArtifactShell>
  );
}

const ArtifactShell = styled(Shell)`
  width: min(980px, calc(100vw - 360px));
`;
