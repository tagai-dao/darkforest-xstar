/*
 * Creates components for use by the client.
 *
 * By default it returns the components from setupNetwork.ts, those which are
 * automatically inferred from the mud.config.ts table definitions.
 *
 * However, you can add or override components here as needed. This
 * lets you add user defined components, which may or may not have
 * an onchain component.
 */

import type { SetupNetworkResult } from "./setupNetwork";

export type ClientComponents = ReturnType<typeof createClientComponents>;

export function createClientComponents({
  components,
  latestBlock$,
}: SetupNetworkResult) {
  let chainClockOffsetMs = 0;
  latestBlock$.subscribe((block) => {
    chainClockOffsetMs = Number(block.timestamp) * 1000 - Date.now();
  });

  return {
    ...components,
    getChainClockOffsetMs: () => chainClockOffsetMs,
  };
}
