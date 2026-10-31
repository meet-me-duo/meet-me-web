import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Test-only proxy to the isolated synthetic-provider application, never production. */
export default defineConfig({
  plugins: [react()],
  define: { "import.meta.env.VITE_API_BASE_URL": JSON.stringify("") },
  server: { host: "127.0.0.1", port: 4189, strictPort: true, proxy: { "/api": { target: "http://127.0.0.1:18932", changeOrigin: true } } },
});
