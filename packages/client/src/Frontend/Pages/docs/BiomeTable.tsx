import { Biome, MaterialType, SpaceType } from "@df/types";
import { useEffect, useState } from "react";
import styled from "styled-components";

import dfstyles from "../../Styles/dfstyles";
import { getMaterialColor } from "../../Utils/materialColor";
import {
  renderBiomeCatalog,
  TYPE_SHOTS,
  type TypeShot,
  type TypeShotKey,
} from "./biomeShots";

type MaterialCell = {
  id: MaterialType;
  name: string;
  multiplier: string;
};

type BiomeRow = {
  biome: Biome;
  name: string;
  materials: MaterialCell[];
};

type SpaceGroup = {
  space: string;
  spaceType: SpaceType;
  // 这个空间的权重表里出现过的类型。0 级全是行星，这里按 1 级及以上合并。
  types: TypeShotKey[];
  // 相对星云。同一空间里的生态共用这些数字。
  stats: string[];
  // 这个空间的铸造厂能发现的神器。四种等概率，不看生态。
  artifacts: string[];
  biomes: BiomeRow[];
};

// 合约按稀有度的概率表抽类型，每一档都是这四项各 1024。
const FOUNDRY_ARTIFACTS = ["粉红炸弹", "布隆过滤器", "虫洞", "火炮"];

const ALL_TYPES: TypeShotKey[] = TYPE_SHOTS.map((type) => type.key);

const GROUPS: SpaceGroup[] = [
  {
    space: "星云",
    spaceType: SpaceType.NEBULA,
    types: ["planet", "mine", "rip", "quasar"],
    stats: ["等级上限 4", "升级合计 3", "没有铸造厂"],
    artifacts: ["没有铸造厂"],
    biomes: [
      {
        biome: Biome.OCEAN,
        name: "Ocean 海洋",
        materials: [
          {
            id: MaterialType.WATER_CRYSTALS,
            name: "水晶体",
            multiplier: "105",
          },
        ],
      },
      {
        biome: Biome.FOREST,
        name: "Forest 森林",
        materials: [
          { id: MaterialType.LIVING_WOOD, name: "活木", multiplier: "110" },
        ],
      },
      {
        biome: Biome.GRASSLAND,
        name: "Grassland 草原",
        materials: [
          { id: MaterialType.WINDSTEEL, name: "风钢", multiplier: "120" },
        ],
      },
    ],
  },
  {
    space: "太空",
    spaceType: SpaceType.SPACE,
    types: ALL_TYPES,
    stats: [
      "等级上限 5",
      "升级合计 4",
      "射程、速度 125%",
      "上限、成长 125%",
      "防御 50%",
      "初始能量 400%",
    ],
    artifacts: FOUNDRY_ARTIFACTS,
    biomes: [
      {
        biome: Biome.TUNDRA,
        name: "Tundra 苔原",
        materials: [
          { id: MaterialType.AURORIUM, name: "极光金", multiplier: "130" },
        ],
      },
      {
        biome: Biome.SWAMP,
        name: "Swamp 沼泽",
        materials: [
          { id: MaterialType.MYCELIUM, name: "菌胶", multiplier: "150" },
        ],
      },
      {
        biome: Biome.DESERT,
        name: "Desert 沙漠",
        materials: [
          { id: MaterialType.SANDGLASS, name: "沙玻璃", multiplier: "180" },
        ],
      },
    ],
  },
  {
    space: "深空",
    spaceType: SpaceType.DEEP_SPACE,
    types: ALL_TYPES,
    stats: [
      "等级上限 9",
      "升级合计 5",
      "射程、速度 150%",
      "上限、成长 150%",
      "防御 25%",
      "初始能量 1000%",
    ],
    artifacts: FOUNDRY_ARTIFACTS,
    biomes: [
      {
        biome: Biome.ICE,
        name: "Ice 冰原",
        materials: [
          { id: MaterialType.CRYOSTONE, name: "冰晶石", multiplier: "200" },
        ],
      },
      {
        biome: Biome.WASTELAND,
        name: "Wasteland 荒原",
        materials: [
          { id: MaterialType.SCRAPIUM, name: "废金", multiplier: "250" },
        ],
      },
      {
        biome: Biome.LAVA,
        name: "Lava 熔岩",
        materials: [
          { id: MaterialType.PYROSTEEL, name: "火钢", multiplier: "300" },
        ],
      },
    ],
  },
  {
    space: "死空",
    spaceType: SpaceType.DEAD_SPACE,
    types: ALL_TYPES,
    stats: [
      "等级上限 9",
      "升级合计 5",
      "射程、速度 200%",
      "上限、成长 200%",
      "防御 15%",
      "初始能量 2000%",
    ],
    artifacts: FOUNDRY_ARTIFACTS,
    biomes: [
      {
        biome: Biome.CORRUPTED,
        name: "Corrupted 腐化",
        materials: [
          { id: MaterialType.BLACKALLOY, name: "黑合金", multiplier: "400" },
          {
            id: MaterialType.CORRUPTED_CRYSTAL,
            name: "腐化水晶",
            multiplier: "600",
          },
        ],
      },
    ],
  },
];

// 星云单独一格。后面三个空间出的神器相同，合成一格。
const FOUNDRY_ROW_SPAN = GROUPS.slice(1).reduce(
  (count, group) => count + group.biomes.length,
  0,
);

const BORDER = "1px solid rgba(215, 255, 228, 0.28)";

const Figure = styled.figure`
  margin: 0 0 16px;
`;

const TableWrap = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  border: ${BORDER};
  table-layout: fixed;
  font-size: 14px;
  line-height: 1.5;

  th,
  td {
    padding: 8px 8px;
    border: ${BORDER};
    text-align: left;
    vertical-align: middle;
  }

  th:nth-child(1) {
    width: 320px;
  }

  th:nth-child(2) {
    width: 200px;
  }

  th:nth-child(3) {
    width: 72px;
  }

  th:nth-child(4) {
    width: 22%;
  }

  th:nth-child(5) {
    width: 108px;
  }

  th:nth-child(6) {
    width: 136px;
  }

  th {
    color: ${dfstyles.colors.dfgreen};
    font-weight: 600;
  }
`;

const StatsCell = styled.td`
  width: 22%;
`;

const NameCell = styled.td`
  white-space: nowrap;
`;

const Stats = styled.div`
  color: ${dfstyles.colors.subtext};
  font-size: 12px;
  line-height: 1.45;
`;

const Shots = styled.div`
  display: flex;
  gap: 4px;
  align-items: flex-start;
`;

const Shot = styled.figure`
  margin: 0;
  width: 52px;
  flex: 0 0 52px;
`;

const PlanetShot = styled.img`
  display: block;
  width: 52px;
  height: 52px;
  border-radius: 6px;
  background: #070b0c;
`;

const ShotLabel = styled.figcaption`
  margin-top: 2px;
  color: ${dfstyles.colors.subtext};
  font-size: 10px;
  line-height: 1.2;
  text-align: center;
`;

const Caption = styled.figcaption`
  margin-top: 8px;
  color: ${dfstyles.colors.subtext};
  font-size: 13px;
  line-height: 1.5;
`;

export function BiomeTable() {
  const [shots, setShots] = useState<Record<number, TypeShot>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const rendered = renderBiomeCatalog(
        GROUPS.flatMap((group) =>
          group.biomes.map((row) => ({
            biome: row.biome,
            spaceType: group.spaceType,
          })),
        ),
      );
      setShots(rendered.shots);
      setError(rendered.error);
    } catch (renderError) {
      setError(
        renderError instanceof Error ? renderError.message : "画面没有画出来",
      );
    }
  }, []);

  return (
    <Figure>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <th>画面</th>
              <th>生态</th>
              <th>空间</th>
              <th>空间属性</th>
              <th>铸造厂神器</th>
              <th>小行星带材料</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group, groupIndex) =>
              group.biomes.map((row, index) => {
                const showArtifacts =
                  (groupIndex === 0 && index === 0) ||
                  (groupIndex === 1 && index === 0);
                const artifactSpan =
                  groupIndex === 0 ? group.biomes.length : FOUNDRY_ROW_SPAN;
                return (
                  <tr key={row.biome}>
                    <td>
                      <Shots>
                        {TYPE_SHOTS.filter((type) =>
                          group.types.includes(type.key),
                        ).map((type) => {
                          const src = shots[row.biome]?.[type.key];
                          return (
                            <Shot key={type.key}>
                              {src ? (
                                <PlanetShot
                                  src={src}
                                  alt={`${row.name} ${type.label}`}
                                />
                              ) : (
                                <PlanetShot
                                  as="div"
                                  role="img"
                                  aria-label={`${row.name} ${type.label}`}
                                />
                              )}
                              <ShotLabel>{type.label}</ShotLabel>
                            </Shot>
                          );
                        })}
                      </Shots>
                    </td>
                    <NameCell>{row.name}</NameCell>
                    {index === 0 && (
                      <td rowSpan={group.biomes.length}>{group.space}</td>
                    )}
                    {index === 0 && (
                      <StatsCell rowSpan={group.biomes.length}>
                        <Stats>
                          {group.stats.map((stat) => (
                            <div key={stat}>{stat}</div>
                          ))}
                        </Stats>
                      </StatsCell>
                    )}
                    {showArtifacts && (
                      <td rowSpan={artifactSpan}>
                        <Stats>
                          {group.artifacts.map((artifact) => (
                            <div key={artifact}>{artifact}</div>
                          ))}
                        </Stats>
                      </td>
                    )}
                    <td>
                      {row.materials.map((material) => (
                        <div
                          key={material.id}
                          style={{ color: getMaterialColor(material.id) }}
                        >
                          {material.name} {material.multiplier}%
                        </div>
                      ))}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </Table>
      </TableWrap>
      <Caption>
        铸造厂神器四种等概率，不看生态。生态只刻在神器上。稀有度看铸造厂等级。
        {error}
      </Caption>
    </Figure>
  );
}
