import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import agents from "agents/vite";

// The dev server enables dev-only endpoints; builds keep the production value from wrangler.jsonc.
export default defineConfig(({ command }) => ({
  plugins: [
    agents(),
    react(),
    cloudflare(
      command === "serve" ? { config: { vars: { ENVIRONMENT: "dev" } } } : {},
    ),
    tailwindcss(),
  ],
}));
