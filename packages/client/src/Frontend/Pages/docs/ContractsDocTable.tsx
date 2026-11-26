import { useComponentValue } from "@latticexyz/react";
import { singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "@mud/MUDContext";
import { useEffect, useState } from "react";
import styled from "styled-components";
import {
  type Address,
  isAddress,
  parseAbi,
  type PublicClient,
  zeroAddress,
} from "viem";

import { DocTable, DocTableFrame } from "./DocTable";

const AddrLink = styled.a`
  color: var(--doc-accent);
  word-break: break-all;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const ExtIcon = styled.span`
  margin-left: 6px;
  font-size: 12px;
  opacity: 0.85;
`;

const lockerAbi = parseAbi(["function nft() view returns (address)"]);

type Row = { label: string; address?: string };

function configured(value: string | undefined): Address | undefined {
  if (!value || !isAddress(value) || value.toLowerCase() === zeroAddress) {
    return undefined;
  }
  return value;
}

function explorerUrl(chainId: number, address: string): string {
  if (chainId === 56) {
    return `https://bscscan.com/address/${address}`;
  }
  if (chainId === 8453) {
    return `https://basescan.org/address/${address}`;
  }
  if (chainId === 10) {
    return `https://optimistic.etherscan.io/address/${address}`;
  }
  return `https://etherscan.io/address/${address}`;
}

async function readPassNft(
  publicClient: PublicClient,
  locker: Address | undefined,
): Promise<Address | undefined> {
  if (!locker) return undefined;
  try {
    const nft = await publicClient.readContract({
      address: locker,
      abi: lockerAbi,
      functionName: "nft",
    });
    return configured(nft);
  } catch {
    return undefined;
  }
}

/** 文档「相关合约」：只列地址，点开区块浏览器。不含神器 NFT。 */
export function ContractsDocTable() {
  const {
    network: { publicClient, worldContract },
    components: { DFXStarConfig, GamePassNFT },
  } = useMUD();
  const star = useComponentValue(DFXStarConfig, singletonEntity);
  const pass = useComponentValue(GamePassNFT, singletonEntity);
  const [rows, setRows] = useState<Row[]>([{ label: "World" }]);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      const locker = configured(pass?.addr);
      const nft = await readPassNft(publicClient, locker);
      const next: Row[] = [
        { label: "World", address: worldContract.address },
        { label: "Game Pass 保管", address: locker },
        { label: "Game Pass NFT", address: nft },
        { label: "支付代币", address: configured(star?.paymentToken) },
        { label: "DFXStar 矿池", address: configured(star?.scoreStakingPool) },
        { label: "社区合约", address: configured(star?.community) },
        { label: "质押工厂", address: configured(star?.stakingFactory) },
      ];
      if (!stopped) setRows(next);
    };
    void load();
    return () => {
      stopped = true;
    };
  }, [
    pass?.addr,
    publicClient,
    star?.community,
    star?.paymentToken,
    star?.scoreStakingPool,
    star?.stakingFactory,
    worldContract.address,
  ]);

  const chainId = publicClient.chain?.id ?? 56;

  return (
    <DocTableFrame>
      <DocTable>
        <thead>
          <tr>
            <th scope="col">合约</th>
            <th scope="col">地址</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>
                {row.address ? (
                  <AddrLink
                    href={explorerUrl(chainId, row.address)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {row.address}
                    <ExtIcon aria-hidden>↗</ExtIcon>
                  </AddrLink>
                ) : (
                  "读取中"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </DocTable>
    </DocTableFrame>
  );
}
