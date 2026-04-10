import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  // Windows: sem isto o Vite pode ficar só em IPv6 (::1) e wait-on/tcp em 127.0.0.1 nunca passa.
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
