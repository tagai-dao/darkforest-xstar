import actions from "../../../../../skills/darkforest-local-session/actions.md?raw";
import aggressive from "../../../../../skills/darkforest-local-session/aggressive.md?raw";
import conservative from "../../../../../skills/darkforest-local-session/conservative.md?raw";
import home from "../../../../../skills/darkforest-local-session/home.md?raw";
import mining from "../../../../../skills/darkforest-local-session/mining.md?raw";
import nutbox from "../../../../../skills/darkforest-local-session/nutbox.md?raw";
import offensive from "../../../../../skills/darkforest-local-session/offensive.md?raw";
import play from "../../../../../skills/darkforest-local-session/play.md?raw";
import profit from "../../../../../skills/darkforest-local-session/profit.md?raw";
import skill from "../../../../../skills/darkforest-local-session/SKILL.md?raw";

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
