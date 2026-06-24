import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // relative base so the built app loads over file:// inside Electron
  base: "./",
  plugins: [react()],
  server: { port: 5180, open: true },
});
