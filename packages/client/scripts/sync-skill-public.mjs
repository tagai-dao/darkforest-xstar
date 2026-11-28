/**
 * Copy repo skills/darkforest-punk-player into public/ so CF Pages serves each file.
 * Also writes manifest.json and a directory index so the folder URL is not SPA 404.
 */
import { cpSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = join(here, "..");
const src = join(clientRoot, "../../skills/darkforest-punk-player");
const dest = join(clientRoot, "public/skills/darkforest-punk-player");

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

const publishedFiles = readdirSync(src)
  .filter((name) => name.endsWith(".md") || name === "check-buy-silver.mjs")
  .sort();

const manifest = {
  name: "darkforest-punk-player",
  version: "1.1.3",
  description:
    "BSC Dark Forest player skill. Entry is SKILL.md; fetch every path in files.",
  basePath: "/skills/darkforest-punk-player/",
  entry: "SKILL.md",
  files: publishedFiles,
};

writeFileSync(join(dest, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const links = [
  ["manifest.json", "manifest.json"],
  ...publishedFiles.map((name) => [name, name]),
]
  .map(
    ([href, label]) =>
      `  <li><a href="./${href}">${label}</a>${href === "SKILL.md" ? " (entry)" : ""}</li>`,
  )
  .join("\n");

const indexHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>darkforest-punk-player</title>
  <style>
    body { font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
    a { color: #0a7; }
  </style>
</head>
<body>
  <h1>darkforest-punk-player</h1>
  <p>Agent skill package. Start at <a href="./SKILL.md">SKILL.md</a>, or read <a href="./manifest.json">manifest.json</a> and fetch every file.</p>
  <ul>
${links}
  </ul>
</body>
</html>
`;

writeFileSync(join(dest, "index.html"), indexHtml);
console.log(
  `synced skill → public (${publishedFiles.length} skill files + manifest.json + index.html)`,
);
