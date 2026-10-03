import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
import type { IncomingMessage } from "node:http";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// Dev-only: mirror the Vercel /api/suggest-subtopics function locally, so dynamic
// subtopic suggestions work under `npm run dev` without running `vercel dev`.
// Reads ANTHROPIC_API_KEY from apps/web/.env.local (server-side, not VITE_-prefixed).
function devSuggestApi(anthropicKey: string | undefined, perplexityKey: string | undefined): Plugin {
  return {
    name: "dev-suggest-subtopics",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/suggest-subtopics", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        res.setHeader("content-type", "application/json");
        try {
          if (!anthropicKey) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                error: "Add ANTHROPIC_API_KEY to apps/web/.env.local for local suggestions",
              }),
            );
            return;
          }
          const raw = await readBody(req);
          const body = JSON.parse(raw || "{}");
          const genre = String(body.genre ?? "");
          const language = body.language === "es" ? "es" : "en";
          // Transpile + load the shared module on the fly (it imports the Anthropic SDK).
          const mod = await server.ssrLoadModule("/api/_lib/suggest.ts");
          const result = await mod.suggestSubtopics(genre, anthropicKey, perplexityKey, language);
          res.end(JSON.stringify(result));
        } catch (err) {
          console.error("dev suggest-subtopics failed:", err);
          res.statusCode = 502;
          res.end(JSON.stringify({ error: "Suggestion failed" }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load all env vars (no VITE_ filter) so the dev middleware can read the Anthropic key.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      tailwindcss(),
      devSuggestApi(env.ANTHROPIC_API_KEY, env.PERPLEXITY_API_KEY),
      VitePWA({
        registerType: "autoUpdate",
        workbox: {
          // WITHOUT THIS the service worker serves the app shell for every navigation, so a visitor
          // opening the landing page at / gets the login screen instead. curl sees the real page
          // (no service worker), which makes this a confusing one to diagnose. An allowlist rather
          // than a denylist: the app owns /app and nothing else.
          navigateFallbackAllowlist: [/^\/app/],
          // Workbox maps a request for a directory to <dir>/index.html by default, so a navigation
          // to "/" matched the PRECACHED app shell directly and never reached the fallback rule
          // above — the allowlist looked correct and did nothing. Turning it off is what actually
          // lets the site root reach the network, and the landing page.
          directoryIndex: null,
        },
        manifest: {
          name: "Daily",
          short_name: "Daily",
          description: "Your day, briefed — a personalised daily news report and podcast.",
          theme_color: "#faf8f4",
          background_color: "#faf8f4",
          display: "standalone",
          start_url: "/app",
          icons: [
            { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        // Shared DB types (type-only — erased at build); mirrors the pipeline's @shared alias.
        "@shared": fileURLToPath(new URL("../../shared", import.meta.url)),
      },
    },
  };
});
