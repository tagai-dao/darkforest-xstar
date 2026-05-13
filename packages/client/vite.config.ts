import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import nodePath from "node:path";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import wasm from "@rollup/plugin-wasm";

const dirname = process.cwd();

function resolvePath(path: string) {
  return nodePath.resolve(`${dirname}`, path);
}

export default defineConfig({
  plugins: [react(), nodePolyfills(), wasm()],
  server: {
    port: 3000,
    fs: {
      strict: false,
    },
  },
  build: {
    target: "es2022",
    minify: true,
    sourcemap: true,
    outDir: "dist",
  },
  resolve: {
    alias: {
      "@df": resolvePath("./src/Shared"),
      "@mud": resolvePath("./src/mud"),
      "@hooks": resolvePath("./src/hooks"),
      "@wallet": resolvePath("./src/wallet"),
      "@frontend": resolvePath("./src/Frontend"),
      "@backend": resolvePath("./src/Backend"),
      "@bluepill": resolvePath("./src/BluePill"),
      "@redpill": resolvePath("./src/RedPill"),
    },
  },
  css: {
    devSourcemap: false,
  },
  assetsInclude: ["**/*.zkey", "**/*.wasm"],
  // 强制 DEV=false：本地 `pnpm dev` 时也不挂载 @latticexyz/dev-tools（index.tsx 里 `if (import.meta.env.DEV)`），避免右侧开发栏无法关闭。
  // 代价：getNetworkConfig 里依赖 DEV 的逻辑会按「非开发」走——例如本地需加 `?useBurner` 才会 useBurner；`?asAdmin` 依赖 DEV 的 anvil 默认私钥不会自动启用。
  define: {
    "import.meta.env.DEV": false,
  },
});
