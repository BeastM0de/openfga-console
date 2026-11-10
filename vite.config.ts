import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Keep the output portable across GitHub Pages project URLs and other hosts.
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/@openfga/syntax-transformer/")) return "fga-language";
          if (id.includes("/node_modules/@openfga/sdk/") || id.includes("/node_modules/axios/")) return "fga-sdk";
          if (id.includes("/node_modules/@xyflow/") || id.includes("/node_modules/zustand/")) return "model-graph";
          if (id.includes("/node_modules/@codemirror/") || id.includes("/node_modules/@uiw/")) return "dsl-editor";
        },
      },
    },
  },
});
