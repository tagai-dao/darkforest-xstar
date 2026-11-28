import { PlanetType, PlanetTypeNames } from "@df/types";
import React from "react";
import styled, { keyframes } from "styled-components";

const Wrap = styled.span`
  position: relative;
  top: -5px;
`;

const TextWrap = styled.span`
  position: relative;
  display: inline-block;
  white-space: nowrap;
`;

const Static = styled.span`
  opacity: 0;
`;

const bounce = keyframes`
  from {
    top: 3px;
    filter: hue-rotate(0);
  }
  to {
    top: -3px;
    filter: hue-rotate(360deg);
  }
`;

const AnimDelay = styled.span<{ $index: number }>`
  position: relative;
  animation: ${bounce} 0.5s ease-in-out infinite alternate;
  animation-delay: ${({ $index }) => -$index * 0.04}s;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Anim = styled.span`
  position: absolute;
  color: hsl(0, 100%, 75%);
  transition: color 0.2s;
  display: inline-flex;
  flex-direction: row;
  top: 0;
  left: 0;
`;

export function RippleText({ text }: { text: string }) {
  return (
    <TextWrap>
      <Static>{text}</Static>
      <Anim aria-hidden="true">
        {Array.from(text, (character, index) => (
          <AnimDelay $index={index} key={index}>
            {character === " " ? "\u00a0" : character}
          </AnimDelay>
        ))}
      </Anim>
    </TextWrap>
  );
}

function SpacetimeRipLabelRaw() {
  return (
    <Wrap>
      <RippleText text={PlanetTypeNames[PlanetType.TRADING_POST]} />
    </Wrap>
  );
}

export const SpacetimeRipLabel = React.memo(SpacetimeRipLabelRaw);
