import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      remoteBindings: false,
      miniflare: {
        bindings: {
          ADMIN_TOKEN: "test-admin-token",
          QUEUE_ENCRYPTION_KEY: "test-queue-key",
        },
      },
    }),
  ],
  test: { testTimeout: 60_000 },
});
