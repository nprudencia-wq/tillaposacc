// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        manifest: false,
        devOptions: { enabled: false },
        workbox: {
          clientsClaim: true,
          skipWaiting: true,
          globPatterns: ["**/*.{js,css,ico,png,svg,woff2,webmanifest}"],
          navigateFallback: null,
          cleanupOutdatedCaches: true,
          // The build writes browser files under client/, but the site serves them from the root.
          modifyURLPrefix: { "client/": "" },
          runtimeCaching: [
            {
              urlPattern: ({ request, url, sameOrigin }) => sameOrigin && request.method === "GET" && !url.pathname.startsWith("/~oauth") && (request.mode === "navigate" || url.pathname === "/auth" || url.pathname === "/pos"),
              handler: "NetworkFirst",
              options: {
                cacheName: "pages",
                networkTimeoutSeconds: 3,
                expiration: { maxEntries: 30 },
                plugins: [
                  {
                    // Cold launch with no internet: serve any saved app page (till first) instead of the browser offline screen.
                    handlerDidError: async () => {
                      const c = await caches.open("pages");
                      for (const path of ["/pos", "/auth", "/"]) {
                        const hit = await c.match(new URL(path, self.location.origin).href, { ignoreSearch: true });
                        if (hit) return hit;
                      }
                      return undefined;
                    },
                  },
                ],
              },
            },
            {
              urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/[^/]+-[\w-]+\.(?:js|css|woff2|png|svg)$/.test(url.pathname),
              handler: "CacheFirst",
              options: { cacheName: "assets", expiration: { maxEntries: 200 } },
            },
            {
              urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
              handler: "StaleWhileRevalidate",
              options: { cacheName: "fonts" },
            },
          ],
        },
      }),
    ],
  },
});
