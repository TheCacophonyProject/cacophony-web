import { fileURLToPath, URL } from "url";

import { defineConfig, searchForWorkspaceRoot } from "vite";
import vue from "@vitejs/plugin-vue";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import eslintPlugin from "vite-plugin-eslint";
import Components from "unplugin-vue-components/vite";
import { BootstrapVueNextResolver } from "unplugin-vue-components/resolvers";

function crossOriginIsolationMiddleware(_: any, response: any, next: any) {
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}

const crossOriginIsolation = {
  name: "cross-origin-isolation",
  configureServer: (server: any) => {
    server.middlewares.use(crossOriginIsolationMiddleware);
  },
  configurePreviewServer: (server: any) => {
    server.middlewares.use(crossOriginIsolationMiddleware);
  },
};

// https://vitejs.dev/config/
export default defineConfig({
  envDir: ".",
  optimizeDeps: {
    exclude: ["spectastiq"],
  },
  plugins: [
    Components({
      resolvers: [BootstrapVueNextResolver()],
    }),
    wasm(),
    topLevelAwait(),
    eslintPlugin({
      failOnError: false,
      exclude: ["**/consts.ts", "**/node_modules/**", "**/*.js"],
    }),
    crossOriginIsolation,
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === "spectastiq-viewer",
        },
      },
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
  define: {
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
  server: {
    fs: {
      allow: [
        // search up for workspace root
        searchForWorkspaceRoot(process.cwd()),
        // your custom rules
      ],
    },
  },
});
