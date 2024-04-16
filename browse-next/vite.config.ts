import { fileURLToPath, URL } from "url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import eslintPlugin from "vite-plugin-eslint";
import Components from "unplugin-vue-components/vite";
import { BootstrapVueNextResolver } from "unplugin-vue-components/resolvers";

// https://vitejs.dev/config/
export default defineConfig({
  envDir: ".",
  plugins: [
    vue({ reactivityTransform: true }),
    Components({
      resolvers: [BootstrapVueNextResolver()],
    }),
    wasm(),
    topLevelAwait(),
    eslintPlugin({
      failOnError: false,
      exclude: ["**/consts.ts", "**/node_modules/**", "**/*.js"],
    }),
  ],
  resolve: {
    alias: {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      "@api": fileURLToPath(new URL("./src/api", import.meta.url)),
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      "@views": fileURLToPath(new URL("./src/views", import.meta.url)),
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      "@models": fileURLToPath(new URL("./src/models", import.meta.url)),
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      "@typedefs": fileURLToPath(new URL("../types", import.meta.url)),
    },
  },
});
