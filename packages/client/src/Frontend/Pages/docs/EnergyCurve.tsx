import styled from "styled-components";

import dfstyles from "../../Styles/dfstyles";

/**
 * 能量成长和合约里的逻辑曲线是同一条。
 * 页面单位已经除以 1000。星云 4 级、未升级、属性未加倍时，上限 25000，成长是 2083/1000。
 * tick 速率为 1，所以横轴上的 1 小时等于 3600 个 tick。
 */
const CAP = 25000;
const GROWTH = 2083 / 1000;
const START = 1;
const HOURS = 14;

const Sym = styled.span`
  padding: 0 0.03em;
  font-family: "Times New Roman", Times, serif;
  font-style: italic;
`;

const Sup = styled.sup`
  font-size: 0.62em;
`;

const Sub = styled.sub`
  font-size: 0.62em;
  font-style: normal;
`;

const Frac = styled.span`
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  margin: 0 0.2em;
  vertical-align: middle;
  text-align: center;
`;

const Num = styled.span`
  display: flex;
  align-items: center;
  padding: 0 0.45em 0.16em;
  border-bottom: 1.5px solid currentColor;
`;

const Den = styled.span`
  display: flex;
  align-items: center;
  padding: 0.16em 0.45em 0;
`;

const Figure = styled.figure`
  margin: 0 0 16px;
  max-width: 740px;
  padding: 14px 14px 10px;
  border: 1px solid rgba(0, 220, 130, 0.28);
  border-radius: 4px;
  background: rgba(0, 220, 130, 0.06);
`;

const FormulaLabel = styled.div`
  margin: 8px 0 2px;
  color: ${dfstyles.colors.subtext};
  font-size: 13px;
`;

const MathLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: safe center;
  overflow-x: auto;
  padding: 8px 4px 12px;
  font-family: "Times New Roman", "Songti SC", serif;
  font-size: 22px;
  line-height: 1;
  white-space: nowrap;
`;

const Legend = styled.p`
  margin: 0 0 8px;
  color: ${dfstyles.colors.subtext};
  font-size: 13px;
  line-height: 1.6;
`;

const Chart = styled.svg`
  display: block;
  width: 100%;
  height: auto;
`;

const Caption = styled.figcaption`
  margin-top: 4px;
  color: ${dfstyles.colors.subtext};
  font-size: 13px;
  line-height: 1.5;
`;

function energyAt(seconds: number): number {
  const exponent = (-4 * GROWTH * seconds) / CAP;
  return CAP / (1 + (CAP / START - 1) * Math.exp(exponent));
}

function hoursUntil(energy: number): number {
  const rate = (4 * GROWTH) / CAP;
  const seconds = Math.log((CAP / START - 1) / (CAP / energy - 1)) / rate;
  return seconds / 3600;
}

function EnergyPath() {
  const width = 640;
  const height = 280;
  const left = 62;
  const right = 18;
  const top = 16;
  const bottom = 40;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xOf = (hour: number) => left + (hour / HOURS) * plotWidth;
  const yOf = (energy: number) => top + (1 - energy / CAP) * plotHeight;

  const samples = 280;
  const points = Array.from({ length: samples + 1 }, (_, index) => {
    const hour = (index / samples) * HOURS;
    return `${xOf(hour).toFixed(1)},${yOf(energyAt(hour * 3600)).toFixed(1)}`;
  });
  const halfHour = hoursUntil(CAP / 2);
  const yTicks = [0, CAP / 2, CAP];
  const xTicks = [0, 4, 8, 12];

  return (
    <Chart
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="能量从 1 点沿 S 形曲线升向上限，大约 8.4 小时到达一半"
    >
      <title>能量随时间的 S 形曲线</title>
      {yTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={left}
            x2={width - right}
            y1={yOf(tick)}
            y2={yOf(tick)}
            stroke="rgba(215,255,228,0.16)"
          />
          <text
            x={left - 8}
            y={yOf(tick) + 4}
            fill={dfstyles.colors.subtext}
            fontSize="12"
            textAnchor="end"
          >
            {tick === CAP / 2 ? "12500" : String(tick)}
          </text>
        </g>
      ))}
      {xTicks.map((hour) => (
        <text
          key={hour}
          x={xOf(hour)}
          y={height - 14}
          fill={dfstyles.colors.subtext}
          fontSize="12"
          textAnchor="middle"
        >
          {hour}时
        </text>
      ))}
      <line
        x1={xOf(halfHour)}
        x2={xOf(halfHour)}
        y1={yOf(CAP / 2)}
        y2={top + plotHeight}
        stroke={dfstyles.colors.dfyellow}
        strokeDasharray="4 4"
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={dfstyles.colors.dfgreen}
        strokeWidth="2.5"
      />
      <circle
        cx={xOf(halfHour)}
        cy={yOf(CAP / 2)}
        r="4"
        fill={dfstyles.colors.dfyellow}
      />
      <text
        x={xOf(halfHour) + 8}
        y={yOf(CAP / 2) - 8}
        fill={dfstyles.colors.dfyellow}
        fontSize="12"
      >
        一半，最快
      </text>
      <text x={left} y={12} fill={dfstyles.colors.subtext} fontSize="12">
        能量
      </text>
    </Chart>
  );
}

export function EnergyCurveFigure() {
  return (
    <Figure>
      <FormulaLabel>t 个 tick 之后的能量</FormulaLabel>
      <MathLine
        role="math"
        aria-label="E(t) 等于 C 除以 1 加上（C 除以 E0 减 1）乘以 e 的负 4gt 除以 C 次方"
      >
        <Sym>E</Sym>({<Sym>t</Sym>}) =
        <Frac>
          <Num>
            <Sym>C</Sym>
          </Num>
          <Den>
            1 + (
            <Frac>
              <Num>
                <Sym>C</Sym>
              </Num>
              <Den>
                <Sym>
                  E<Sub>0</Sub>
                </Sym>
              </Den>
            </Frac>
            − 1) <Sym>e</Sym>
            <Sup>
              −4<Sym>g</Sym>
              <Sym>t</Sym>/<Sym>C</Sym>
            </Sup>
          </Den>
        </Frac>
      </MathLine>
      <FormulaLabel>这一刻每个 tick 增加的能量</FormulaLabel>
      <MathLine
        role="math"
        aria-label="dE/dt 等于 4g 乘以 E 除以 C，再乘以 1 减 E 除以 C"
      >
        <Frac>
          <Num>
            <Sym>d</Sym>
            <Sym>E</Sym>
          </Num>
          <Den>
            <Sym>d</Sym>
            <Sym>t</Sym>
          </Den>
        </Frac>
        = 4<Sym>g</Sym>
        <Frac>
          <Num>
            <Sym>E</Sym>
          </Num>
          <Den>
            <Sym>C</Sym>
          </Den>
        </Frac>
        (1 −
        <Frac>
          <Num>
            <Sym>E</Sym>
          </Num>
          <Den>
            <Sym>C</Sym>
          </Den>
        </Frac>
        )
      </MathLine>
      <Legend>
        <Sym>E</Sym> 是这一刻的能量，<Sym>E₀</Sym> 是开始时的能量，<Sym>C</Sym>{" "}
        是上限，
        <Sym>g</Sym> 是面板上的成长，<Sym>t</Sym> 是经过的
        tick。能量正好是上限的一半时，第二个公式等于 <Sym>g</Sym>。
      </Legend>
      <EnergyPath />
      <Caption>
        曲线用星云里一颗没有升级、属性也没有加倍的 4 级行星：上限 25000，成长
        2.08，从 1 点开始。横轴是小时。黄点是上限的一半，那里长得最快，大约 8.4
        小时。开头几个小时几乎贴着横轴。
      </Caption>
    </Figure>
  );
}
