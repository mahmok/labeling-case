import { Hono } from "hono";
import { cors } from "hono/cors";
import { createApplication } from "./src/application.ts";
import { config } from "./src/config.ts";
import { createHealthHandler, livenessHandler } from "./src/health.ts";
import { type ScheduledJob, startJobsWorker, syncJobResult } from "./src/jobs";
import { logger } from "./src/logger";
import { err, ok } from "./src/utils/result.ts";

void (async () => {
  logger.info({ msg: "starting worker service...", port: config.jobs.workerPort });
  const application = await createApplication();
  const api = new Hono();
  // TODO: Remove later
  api.use("*", cors());
  api.get("/health/live", livenessHandler);
  api.get("/health", createHealthHandler(application.db.ping));

  const schedules: ScheduledJob[] = [
    {
      cron: config.jobs.printers.cron,
      retry: config.jobs.printers.retry,
      run: async () => {
        const result = await application.useCases.printers.sync();
        return result.isOk ? ok(syncJobResult(result.value)) : err(result.error);
      },
      runOnStartup: config.jobs.printers.runOnStartup,
      type: "sync-printers",
    },
    {
      cron: config.jobs.labels.cron,
      retry: config.jobs.labels.retry,
      run: async () => {
        const result = await application.useCases.labels.sync();
        return result.isOk ? ok(syncJobResult(result.value)) : err(result.error);
      },
      runOnStartup: config.jobs.labels.runOnStartup,
      type: "sync-labels",
    },
    {
      cron: config.jobs.backfillPrints.cron,
      retry: config.jobs.backfillPrints.retry,
      run: async () => {
        const result = await application.useCases.prints.backfillPrints();
        if (!result.isOk) return err(result.error);
        return ok({
          updated: result.value.map((p) => ({
            id: p.id,
            label: p.label,
            printer: p.printer,
            triggeredBy: p.triggeredBy,
          })),
        });
      },
      runOnStartup: config.jobs.backfillPrints.runOnStartup,
      type: "backfill-prints",
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
