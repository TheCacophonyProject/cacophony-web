import { fileURLToPath, URL } from "url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vitejs.dev/config/
export default defineConfig({
  envDir: ".",
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@api": fileURLToPath(new URL("./src/api", import.meta.url)),
      "@views": fileURLToPath(new URL("./src/views", import.meta.url)),
      "@models": fileURLToPath(new URL("./src/models", import.meta.url)),
      "@typedefs": fileURLToPath(new URL("../types", import.meta.url)),
    },
  },
});
