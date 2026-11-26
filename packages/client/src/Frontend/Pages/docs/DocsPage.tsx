import { useEffect, useLayoutEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import styled from "styled-components";

import { BiomeTable } from "./BiomeTable";
import { ContractsDocTable } from "./ContractsDocTable";
import { DocTable, DocTableFrame } from "./DocTable";
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
  --doc-heading: #eff4fa;
  --doc-text: #c3cedd;
  --doc-muted: #9caec3;
  --doc-border: #29374a;
  --doc-accent: #86e4d7;

  min-height: 100vh;
  background: #0a101b;
  color: var(--doc-text);
  font-family: system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-weight: 400;

  a:focus-visible,
  summary:focus-visible,
  [role="region"]:focus-visible {
    outline: 2px solid var(--doc-accent);
    outline-offset: 2px;
  }
`;

const Header = styled.header`
  border-bottom: 1px solid var(--doc-border);
  background: #101824;
`;

const HeaderInner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 1360px;
  min-height: 60px;
  margin: 0 auto;
  padding: 0 clamp(16px, 3.5vw, 44px);
`;

const Brand = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 14px;
  color: var(--doc-heading);
  font-size: 15px;
  font-weight: 650;
  text-decoration: none;

  img {
    display: block;
    width: 34px;
    height: 34px;
  }

  span {
    padding-left: 14px;
    border-left: 1px solid var(--doc-border);
  }
`;

const BackLink = styled(Link)`
  color: var(--doc-accent);
  font-size: 14px;
  white-space: nowrap;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr) 146px;
  gap: clamp(24px, 4vw, 64px);
  max-width: 1360px;
  margin: 0 auto;
  padding: 36px clamp(16px, 3.5vw, 44px) 72px;

  @media (max-width: 1120px) {
    grid-template-columns: 136px minmax(0, 1fr);
  }

  @media (max-width: 680px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 26px;
    padding-top: 20px;
  }
`;

const Side = styled.nav`
  position: sticky;
  top: 24px;
  align-self: start;
  display: grid;
  gap: 3px;

  @media (max-width: 680px) {
    position: static;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    padding-bottom: 12px;
    border-bottom: 1px solid var(--doc-border);
  }
`;

const SideLabel = styled.div`
  grid-column: 1 / -1;
  margin-bottom: 9px;
  color: var(--doc-muted);
  font-size: 13px;
  font-weight: 600;
`;

const ChapterLink = styled(Link)`
  display: block;
  padding: 7px 10px;
  border-radius: 5px;
  color: var(--doc-text);
  font-size: 14px;
  text-decoration: none;

  &:hover {
    background: #172232;
    color: var(--doc-heading);
  }

  &[aria-current] {
    background: #173034;
    color: var(--doc-accent);
    font-weight: 650;
  }

  @media (max-width: 680px) {
    padding: 6px 3px;
    text-align: center;
  }
`;

const Article = styled.article`
  min-width: 0;
  overflow-wrap: anywhere;

  h1 + h2,
  details + h2 {
    margin-top: 22px;
  }
`;

const Title = styled.h1`
  margin: 0 0 22px;
  color: var(--doc-heading);
  font-size: clamp(32px, 4vw, 42px);
  font-weight: 700;
  line-height: 1.22;
`;

const Paragraph = styled.p`
  margin: 0 0 12px;
  font-size: 15px;
  line-height: 1.8;
`;

const SourceLink = styled.a`
  color: var(--doc-accent);
  text-decoration: underline;
  text-underline-offset: 3px;
`;

const SectionTitle = styled.h2`
  margin: 34px 0 12px;
  padding-top: 23px;
  border-top: 1px solid var(--doc-border);
  color: var(--doc-heading);
  font-size: 22px;
  font-weight: 650;
  line-height: 1.35;
  scroll-margin-top: 24px;
`;

const List = styled.ul`
  margin: 0 0 16px;
  padding-left: 23px;
  list-style: disc;
  font-size: 15px;
  line-height: 1.8;

  &:is(ol) {
    list-style: decimal;
  }

  li + li {
    margin-top: 5px;
  }

  li::marker {
    color: var(--doc-accent);
    font-weight: 600;
  }
`;

const SectionNav = styled.nav`
  position: sticky;
  top: 24px;
  align-self: start;

  @media (max-width: 1120px) {
    display: none;
  }
`;

const InlineSectionNav = styled.details`
  margin: 0 0 18px;
  padding: 8px 12px;
  border: 1px solid var(--doc-border);
  border-radius: 6px;
  font-size: 14px;

  summary {
    color: var(--doc-heading);
    cursor: pointer;
  }

  &[open] summary {
    margin-bottom: 8px;
  }

  @media (min-width: 1121px) {
    display: none;
  }
`;

const TocLink = styled(Link)`
  display: block;
  padding: 4px 0 4px 11px;
  border-left: 1px solid var(--doc-border);
  color: var(--doc-muted);
  font-size: 13px;
  line-height: 1.5;
  text-decoration: none;

  &:hover,
  &[aria-current] {
    border-color: var(--doc-accent);
    color: var(--doc-accent);
  }
`;

const Term = styled.strong`
  font-weight: 650;
`;

const TermDetail = styled.small`
  display: block;
  margin-top: 2px;
  color: var(--doc-muted);
  font-size: 12px;
  font-weight: 400;
`;

const ComparisonTable = styled(DocTable)`
  table-layout: fixed;

  thead th:first-child {
    width: 22%;
  }

  thead th:nth-child(2) {
    width: 24%;
  }

  @media (max-width: 480px) {
    thead th:first-child {
      width: 27%;
    }
  }
`;

function DocRunView({ run }: { run: DocRun }) {
  if (typeof run === "string") return <>{run}</>;

  return (
    <>
      <Term style={{ color: run.color }}>{run.text}</Term>
      {run.detail && <TermDetail lang="en">{run.detail}</TermDetail>}
    </>
  );
}

function Blocks({ blocks }: { blocks: DocBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "h2":
            return (
              <SectionTitle id={block.id} key={block.id}>
                {block.title}
              </SectionTitle>
            );
          case "ul":
          case "ol":
            return (
              <List as={block.kind} key={index}>
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </List>
            );
          case "contracts":
            return <ContractsDocTable key={index} />;
          case "energy-figure":
            return <EnergyCurveFigure key={index} />;
          case "space-figure":
            return <SpaceTypeMapFigure key={index} />;
          case "biome-figure":
            return <BiomeTable key={index} />;
          case "table": {
            const Table = block.comparison ? ComparisonTable : DocTable;
            const numeric = (column: number) =>
              block.numericColumns?.includes(column) || undefined;

            return (
              <DocTableFrame
                key={index}
                tabIndex={0}
                role="region"
                aria-label={block.headers.join("、")}
              >
                <Table>
                  <thead>
                    <tr>
                      {block.headers.map((header, column) => (
                        <th
                          key={header}
                          scope="col"
                          data-numeric={numeric(column)}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map(([label, ...cells], rowIndex) => (
                      <tr key={rowIndex}>
                        <th scope="row" data-numeric={numeric(0)}>
                          <DocRunView run={label} />
                        </th>
                        {cells.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            data-numeric={numeric(cellIndex + 1)}
                          >
                            <DocRunView run={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </DocTableFrame>
            );
          }
          case "link":
            return (
              <Paragraph key={index}>
                <SourceLink href={block.href} target="_blank" rel="noreferrer">
                  {block.label} <span aria-hidden="true">↗</span>
                </SourceLink>
              </Paragraph>
            );
          case "rich":
            return (
              <Paragraph key={index}>
                {block.parts.map((part, partIndex) => (
                  <DocRunView key={partIndex} run={part} />
                ))}
              </Paragraph>
            );
          case "p":
            return <Paragraph key={index}>{block.text}</Paragraph>;
        }
      })}
    </>
  );
}

export function DocsPage() {
  const { section } = useParams();
  const { pathname, hash, key } = useLocation();
  const chapter = findChapter(section);
  const headings = chapterHeadings(chapter);
  const [current, setCurrent] = useState<string | undefined>(headings[0]?.id);

  useLayoutEffect(() => {
    const id = hash.slice(1);
    const target = chapterHeadings(chapter).some((heading) => heading.id === id)
      ? document.getElementById(id)
      : null;
    if (target) {
      target.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
  }, [chapter, hash, key]);

  useEffect(() => {
    const nodes = chapterHeadings(chapter)
      .map(({ id }) => document.getElementById(id))
      .filter((node): node is HTMLElement => node !== null)
      .reverse();

    const update = () => {
      const visible = nodes.find(
        (node) => node.getBoundingClientRect().top <= 80,
      );
      const atBottom =
        window.scrollY > 0 &&
        window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 2;
      const anchor = hash.slice(1);
      const anchored = atBottom && nodes.find((node) => node.id === anchor);
      setCurrent((anchored || visible || nodes.at(-1))?.id);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [chapter, hash]);

  const sectionLinks = headings.map((heading) => (
    <TocLink
      key={heading.id}
      to={{ pathname, hash: `#${heading.id}` }}
      aria-current={heading.id === current ? "location" : undefined}
    >
      {heading.title}
    </TocLink>
  ));

  return (
    <Shell>
      <Header>
        <HeaderInner>
          <Brand to="/docs/overview">
            <img src="/darkforest_punk_logo.png" alt="Dark Forest Punk" />
            <span>游戏文档</span>
          </Brand>
          <BackLink to="/">
            <span aria-hidden="true">←</span> 返回游戏
          </BackLink>
        </HeaderInner>
      </Header>
      <Layout>
        <Side aria-label="文档章节">
          <SideLabel>文档章节</SideLabel>
          {gameDocs.map((item) => (
            <ChapterLink
              key={item.id}
              to={`/docs/${item.id}`}
              aria-current={item.id === chapter.id ? "page" : undefined}
            >
              {item.title}
            </ChapterLink>
          ))}
        </Side>
        <main>
          <Article aria-labelledby="doc-title">
            <Title id="doc-title">{chapter.title}</Title>
            <InlineSectionNav key={chapter.id}>
              <summary>本页目录</summary>
              <nav aria-label="本页目录">{sectionLinks}</nav>
            </InlineSectionNav>
            <Blocks blocks={chapter.blocks} />
          </Article>
        </main>
        <SectionNav aria-label="本页目录">
          <SideLabel>本页目录</SideLabel>
          {sectionLinks}
        </SectionNav>
      </Layout>
    </Shell>
  );
}
