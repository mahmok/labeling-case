import { createApp } from "./src/app.ts";
import { config } from "./src/config";
import { createDatabase } from "./src/db";
import { logger } from "./src/logger";

void (async () => {
  logger.info({ msg: "starting server...", port: config.api.port });
  const db = await createDatabase();
  const app = await createApp(db);

  const server = Bun.serve({
    fetch: app.api.fetch,
    port: config.api.port,
  });

  logger.info({ msg: "server started" });

  const shutdown = async (signal: "SIGINT" | "SIGTERM"): Promise<void> => {
    try {
      logger.info({ msg: "shutting down...", signal });
      await server.stop();
    } catch (error) {
      logger.error({ error, msg: "shutdown failed", signal });
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
})();
