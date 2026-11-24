import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import styled from "styled-components";

import dfstyles from "../../Styles/dfstyles";
import { BiomeTable } from "./BiomeTable";
import { ContractsDocTable } from "./ContractsDocTable";
import { EnergyCurveFigure } from "./EnergyCurve";
import {
  chapterHeadings,
  type DocBlock,
  type DocRun,
  findChapter,
  gameDocs,
} from "./gameDocs";
import { SpaceTypeMapFigure } from "./SpaceTypeMap";

const Shell = styled.div`
  display: grid;
  /* 左栏是原来 220px 的一半，右栏是原来的 2/3。 */
  grid-template-columns: 110px minmax(0, 1fr) calc(220px * 2 / 3);
  height: 100vh;
  background: ${dfstyles.colors.background};
  color: ${dfstyles.colors.text};
  font-family: "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
    height: auto;
    min-height: 100vh;
  }
`;

const Side = styled.nav`
  overflow: auto;
  padding: 20px 16px 32px;
  border-right: 1px solid rgba(0, 220, 130, 0.22);

  @media (max-width: 960px) {
    border-right: none;
    border-bottom: 1px solid rgba(0, 220, 130, 0.22);
  }
`;

const SideLabel = styled.div`
  margin: 18px 0 8px;
  color: ${dfstyles.colors.subtext};
  font-size: 12px;
`;

const ChapterLink = styled(Link).withConfig({
  shouldForwardProp: (prop) => String(prop) !== "$active",
})<{ $active: boolean }>`
  display: block;
  margin: 2px 0;
  padding: 8px 10px;
  border-radius: 4px;
  color: ${(props) =>
    props.$active ? dfstyles.colors.background : dfstyles.colors.text};
  background: ${(props) =>
    props.$active ? dfstyles.colors.dfgreen : "transparent"};
  text-decoration: none;
  font-size: 14px;
`;

const BackLink = styled(Link)`
  color: ${dfstyles.colors.dfgreen};
  font-size: 14px;
  text-decoration: none;
`;

const Article = styled.article`
  overflow: auto;
  padding: 28px 36px 80px;

  @media (max-width: 960px) {
    padding: 20px 16px 48px;
  }
`;

const Title = styled.h1`
  margin: 0 0 18px;
  color: ${dfstyles.colors.dfgreen};
  font-size: 28px;
  font-weight: 650;
`;

const Paragraph = styled.p`
  margin: 0 0 14px;
  font-size: 16px;
  line-height: 1.75;
`;

const SectionTitle = styled.h2`
  margin: 28px 0 12px;
  color: ${dfstyles.colors.dfpink};
  font-size: 20px;
  scroll-margin-top: 16px;
`;

const BulletList = styled.ul`
  margin: 0 0 14px;
  padding-left: 20px;
  font-size: 16px;
  line-height: 1.7;
`;

const TableWrap = styled.div`
  margin: 0 0 16px;
  overflow-x: auto;
`;

const Table = styled.table`
  border-collapse: collapse;
  font-size: 14px;
  line-height: 1.5;

  th,
  td {
    padding: 6px 10px;
    border-bottom: 1px solid rgba(215, 255, 228, 0.16);
    text-align: left;
    white-space: nowrap;
  }

  th {
    color: ${dfstyles.colors.dfgreen};
    font-weight: 600;
  }
`;

const Toc = styled.nav`
  overflow: auto;
  padding: 28px 16px;
  border-left: 1px solid rgba(0, 220, 130, 0.22);

  @media (max-width: 960px) {
    border-left: none;
    border-top: 1px solid rgba(0, 220, 130, 0.22);
  }
`;

const TocLink = styled.a.withConfig({
  shouldForwardProp: (prop) => String(prop) !== "$active",
})<{ $active: boolean }>`
  display: block;
  margin: 4px 0;
  color: ${(props) =>
    props.$active ? dfstyles.colors.dfgreen : dfstyles.colors.subtext};
  font-size: 13px;
  line-height: 1.5;
  text-decoration: none;
`;

function runText(run: DocRun): string {
  return typeof run === "string" ? run : run.text;
}

function DocRunView({ run }: { run: DocRun }) {
  if (typeof run === "string") {
    return <>{run}</>;
  }
  return <span style={{ color: run.color }}>{run.text}</span>;
}

function Blocks({ blocks }: { blocks: DocBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === "h2") {
          return (
            <SectionTitle id={block.id} key={block.id}>
              {block.title}
            </SectionTitle>
          );
        }
        if (block.kind === "ul") {
          return (
            <BulletList key={index}>
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </BulletList>
          );
        }
        if (block.kind === "contracts") {
          return <ContractsDocTable key={index} />;
        }
        if (block.kind === "energy-figure") {
          return <EnergyCurveFigure key={index} />;
        }
        if (block.kind === "space-figure") {
          return <SpaceTypeMapFigure key={index} />;
        }
        if (block.kind === "biome-figure") {
          return <BiomeTable key={index} />;
        }
        if (block.kind === "table") {
          return (
            <TableWrap key={index}>
              <Table>
                <thead>
                  <tr>
                    {block.headers.map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row) => (
                    <tr key={row.map(runText).join("|")}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>
                          <DocRunView run={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          );
        }
        if (block.kind === "rich") {
          return (
            <Paragraph key={index}>
              {block.parts.map((part, partIndex) => (
                <DocRunView key={partIndex} run={part} />
              ))}
            </Paragraph>
          );
        }
        return <Paragraph key={index}>{block.text}</Paragraph>;
      })}
    </>
  );
}

export function DocsPage() {
  const { section } = useParams();
  const chapter = findChapter(section);
  const headings = chapterHeadings(chapter);
  const [current, setCurrent] = useState(headings[0]?.id ?? "");

  useEffect(() => {
    const visibleHeadings = chapterHeadings(chapter);
    setCurrent(visibleHeadings[0]?.id ?? "");
    const nodes = visibleHeadings
      .map((heading) => document.getElementById(heading.id))
      .filter((node): node is HTMLElement => node !== null);
    if (nodes.length === 0) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) => right.intersectionRatio - left.intersectionRatio,
          )[0];
        if (visible) {
          setCurrent(visible.target.id);
        }
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    for (const node of nodes) {
      observer.observe(node);
    }
    return () => observer.disconnect();
  }, [chapter]);

  return (
    <Shell>
      <Side>
        <BackLink to="/">返回游戏</BackLink>
        <SideLabel>分类</SideLabel>
        {gameDocs.map((item) => (
          <ChapterLink
            key={item.id}
            to={`/docs/${item.id}`}
            $active={item.id === chapter.id}
          >
            {item.title}
          </ChapterLink>
        ))}
      </Side>
      <Article>
        <Title>{chapter.title}</Title>
        <Blocks blocks={chapter.blocks} />
      </Article>
      <Toc>
        <SideLabel>本页目录</SideLabel>
        {headings.map((heading) => (
          <TocLink
            key={heading.id}
            href={`#${heading.id}`}
            $active={heading.id === current}
            onClick={(event) => {
              event.preventDefault();
              document.getElementById(heading.id)?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
              setCurrent(heading.id);
            }}
          >
            {heading.title}
          </TocLink>
        ))}
      </Toc>
    </Shell>
  );
}
