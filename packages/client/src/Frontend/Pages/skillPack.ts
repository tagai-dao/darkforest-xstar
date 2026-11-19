import actions from "../../../../../skills/darkforest-punk-player/actions.md?raw";
import aggressive from "../../../../../skills/darkforest-punk-player/aggressive.md?raw";
import conservative from "../../../../../skills/darkforest-punk-player/conservative.md?raw";
import home from "../../../../../skills/darkforest-punk-player/home.md?raw";
import mining from "../../../../../skills/darkforest-punk-player/mining.md?raw";
import nutbox from "../../../../../skills/darkforest-punk-player/nutbox.md?raw";
import offensive from "../../../../../skills/darkforest-punk-player/offensive.md?raw";
import play from "../../../../../skills/darkforest-punk-player/play.md?raw";
import profit from "../../../../../skills/darkforest-punk-player/profit.md?raw";
import skill from "../../../../../skills/darkforest-punk-player/SKILL.md?raw";

const files = [
  ["SKILL.md", skill],
  ["home.md", home],
  ["mining.md", mining],
  ["play.md", play],
  ["actions.md", actions],
  ["nutbox.md", nutbox],
  ["aggressive.md", aggressive],
  ["conservative.md", conservative],
  ["offensive.md", offensive],
  ["profit.md", profit],
] as const;

/** 一份可粘贴的 skill。入口文件引用的说明都拼在后面，agent 不用再找同目录文件。 */
export const skillPack = files
  .map(([name, body]) => `# ${name}\n\n${body.trim()}\n`)
  .join("\n");
