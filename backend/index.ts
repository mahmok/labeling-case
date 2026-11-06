import { RootApp } from "./src/app.ts";
import { config } from "./src/config";
import { logger } from "./src/logger";

const server = Bun.serve({
  fetch: RootApp.fetch,
  port: config.api.port,
});

logger.info({ msg: "server started", port: config.api.port });

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
