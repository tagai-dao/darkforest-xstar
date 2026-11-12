import styled from "styled-components";

import dfstyles from "../../Styles/dfstyles";
import mapUrl from "./space-type-map.png";

/**
 * 这一局的空间场。和合约配置一致：空间密钥 1730，尺度 8192，不镜像，
 * 阈值 14 / 15 / 19。区域 4（75000 到 87500）强制为星云。
 * 图是 501×501 的坐标采样，步长 400。配色用来区分四种空间，比游戏里的底色更亮。
 * 改密钥、尺度、阈值或区域边界之后，要按同一套 perlin 重画 space-type-map.png。
 */
const NEBULA = "#00dc82";
const SPACE = "#00ade1";
const DEEP = "#9189d9";
const DEAD = "#c46500";

const Figure = styled.figure`
  margin: 0 0 16px;
  max-width: 740px;
  padding: 14px 14px 10px;
  border: 1px solid rgba(0, 220, 130, 0.28);
  border-radius: 4px;
  background: rgba(0, 220, 130, 0.06);
`;

const Map = styled.img`
  display: block;
  width: 100%;
  height: auto;
`;

const Key = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 10px 0 8px;
  color: ${dfstyles.colors.subtext};
  font-size: 13px;
  line-height: 1.6;
`;

const Swatch = styled.span.withConfig({
  shouldForwardProp: (prop) => String(prop) !== "$color",
})<{ $color: string }>`
  display: inline-block;
  width: 0.8em;
  height: 0.8em;
  margin-right: 6px;
  border-radius: 2px;
  vertical-align: -0.1em;
  background: ${(props) => props.$color};
`;

const Caption = styled.figcaption`
  margin-top: 4px;
  color: ${dfstyles.colors.subtext};
  font-size: 13px;
  line-height: 1.5;
`;

export function SpaceTypeMapFigure() {
  return (
    <Figure>
      <Map
        src={mapUrl}
        alt="半径 100000 的圆盘。星云、太空、深空、死空成片分布。75000 到 87500 的一圈全部是星云。三条细圈是 37500、75000、87500。"
      />
      <Key>
        <span>
          <Swatch $color={NEBULA} />
          星云
        </span>
        <span>
          <Swatch $color={SPACE} />
          太空
        </span>
        <span>
          <Swatch $color={DEEP} />
          深空
        </span>
        <span>
          <Swatch $color={DEAD} />
          死空
        </span>
      </Key>
      <Caption>
        三条细圈从里到外是半径 37500、75000、87500。75000 到 87500
        的实心环全部是星云。
      </Caption>
    </Figure>
  );
}
