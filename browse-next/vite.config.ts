import { fileURLToPath, URL } from "url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import eslintPlugin from "vite-plugin-eslint";

// https://vitejs.dev/config/
export default defineConfig({
  envDir: ".",
  plugins: [
    vue({ reactivityTransform: true }),
    wasm(),
    topLevelAwait(),
    eslintPlugin({
      failOnError: false,
      exclude: ["**/consts.ts", "**/node_modules/**", "**/*.js"],
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@api": fileURLToPath(new URL("./src/api", import.meta.url)),
      "@views": fileURLToPath(new URL("./src/views", import.meta.url)),
      "@models": fileURLToPath(new URL("./src/models", import.meta.url)),
      "@typedefs": fileURLToPath(new URL("../types", import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ["@jsquash/webp"],
  },
  // build: {
  //   rollupOptions: {
  //     output: {
  //       inlineDynamicImports: false,
  //       format: "iife",
  //     },
  //   },
  // },
});
