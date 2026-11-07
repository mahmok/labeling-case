import { Hono } from "hono";
import { createApplication } from "./src/application.ts";
import { config } from "./src/config.ts";
import { type ScheduledJob, startJobsWorker } from "./src/jobs";
import { logger } from "./src/logger";
import { err, ok } from "./src/utils/result.ts";

void (async () => {
  logger.info({ msg: "starting worker service...", port: config.jobs.workerPort });
  const application = await createApplication();
  const api = new Hono();
  api.get("/health", (c) => c.json({ status: "running" }));

  const schedules: ScheduledJob[] = [
    {
      cron: config.jobs.printers.cron,
      retry: config.jobs.printers.retry,
      run: async () => {
        const result = await application.useCases.printers.sync();
        if (!result.isOk) return err(result.error);
        return ok({
          created: result.value.created.length,
          deleted: result.value.deleted.length,
          updated: result.value.updated.length,
        });
      },
      runOnStartup: config.jobs.printers.runOnStartup,
      type: "sync-printers",
    },
  ];
  const jobsWorker = startJobsWorker(application.useCases.jobs, schedules);

  const server = Bun.serve({
    fetch: api.fetch,
    port: config.jobs.workerPort,
  });
  logger.info({ msg: "worker service started" });

  const shutdown = async (signal: "SIGINT" | "SIGTERM"): Promise<void> => {
    try {
      logger.info({ msg: "shutting down...", signal });
      await jobsWorker.stop();
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
