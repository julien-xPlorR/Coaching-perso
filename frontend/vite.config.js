import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En dev, le frontend tourne sur :5173 et proxifie /api vers le backend :8787
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
