import { createApi } from "./src/api.ts";
import { createApplication } from "./src/application.ts";
import { config } from "./src/config.ts";
import { logger } from "./src/logger";

void (async () => {
  logger.info({ msg: "starting API server...", port: config.api.port });
  const application = await createApplication();
  const api = createApi(application.useCases);

  const server = Bun.serve({
    fetch: api.fetch,
    port: config.api.port,
  });

  logger.info({ msg: "API server started" });

  const shutdown = async (signal: "SIGINT" | "SIGTERM"): Promise<void> => {
    try {
      logger.info({ msg: "shutting down...", signal });
      await server.stop();
      await application.db.close();
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
