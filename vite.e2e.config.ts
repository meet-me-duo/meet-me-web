import { mergeConfig, type Plugin } from "vite";
import base from "./vite.config";

// Popup first navigations may happen before Playwright attaches interception.
// Keep that request synthetic on the existing local preview server as well.
const popupOAuthFixture: Plugin = {
  name: "local-e2e-popup-oauth-fixture",
  configurePreviewServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.method !== "GET" || request.url !== "/api/auth/google/start") return next();
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end("<p>Local OAuth fixture</p>");
    });
  },
};

export default mergeConfig(base, { plugins: [popupOAuthFixture] });
