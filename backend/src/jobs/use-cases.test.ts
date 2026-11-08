import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { config } from "../config.ts";
import { createDatabase } from "../db";
import { err, ok } from "../utils/result.ts";
import type { Job } from "./domain.ts";
import { fromDialect } from "./repository";
import type { CreateJobInput, GetJobsInput } from "./repository/interface.ts";
import { createJobUseCases, type JobsUseCases } from "./use-cases.ts";
import { createScheduleRunner, runScheduledJob, startJobsWorker, startPendingApiJobs } from "./worker.ts";

let useCases: JobsUseCases;
let closeDatabase: () => Promise<void> = async () => {};

const createJob = async (overrides: Partial<CreateJobInput> = {}): Promise<Job> => {
  const result = await useCases.createJobs([{ type: `sync-${crypto.randomUUID()}`, ...overrides }]);
  if (!result.isOk) throw result.error;
  const job = result.value[0];
  if (!job) throw new Error("Expected job creation to return a row");
  return job;
};

describe("Job use cases", () => {
  beforeEach(async () => {
    config.database.dialect = "sqlite";
    const database = await createDatabase();
    if (database.dialect !== "sqlite") throw new Error("Expected SQLite database");
    const repository = await fromDialect("sqlite");
    useCases = createJobUseCases({ repository, uow: database.uow });
    closeDatabase = database.close;
  });

  afterEach(async () => {
    await closeDatabase();
  });

  test("createJobs creates a batch with default trigger, pending state, and no duration", async () => {
    const first = { triggeredBy: "cron", type: "sync-printers" };
    const second = { type: "sync-labels" };
    const result = await useCases.createJobs([first, second]);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(
        result.value.map(({ attempts, durationMs, startedAt, status, triggeredBy, type }) => ({
          attempts,
          durationMs,
          startedAt,
          status,
          triggeredBy,
          type,
        })),
      ).toEqual([
        {
          attempts: 0,
          durationMs: null,
          startedAt: null,
          status: "pending",
          triggeredBy: "cron",
          type: first.type,
        },
        {
          attempts: 0,
          durationMs: null,
          startedAt: null,
          status: "pending",
          triggeredBy: "system",
          type: second.type,
        },
      ]);
    }
  });

  test("getJobs filters jobs by ID, type, and status", async () => {
    const target = await createJob({ type: "sync-labels" });
    await createJob({ type: "sync-printers" });

    const result = await useCases.getJobs({ id: [target.id], status: ["pending"], type: ["sync-labels"] });
    expect(result).toEqual({ isOk: true, value: [target] });
  });

  test("skips a scheduled job when the same type is already running", async () => {
    let finishTask: (() => void) | undefined;
    let markStarted: (() => void) | undefined;
    const taskStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const blockedTask = new Promise<void>((resolve) => {
      finishTask = resolve;
    });
    let runCount = 0;
    const runner = createScheduleRunner(useCases);
    const schedule = {
      cron: "* * * * *",
      retry: { initialDelayMs: 1, maxAttempts: 2, maxDelayMs: 2, multiplier: 2 },
      run: async () => {
        runCount += 1;
        markStarted?.();
        await blockedTask;
        return ok({ synced: 1 });
      },
      runOnStartup: false,
      type: "sync-printers",
    };

    const firstRun = runner.run(schedule);
    await taskStarted;
    await runner.run(schedule);
    expect(runCount).toBe(1);
    finishTask?.();
    await firstRun;
    expect(await useCases.getJobs({ type: ["sync-printers"] })).toMatchObject({
      isOk: true,
      value: [{ status: "completed" }],
    });
  });

  test("starts a pending API-triggered job without waiting for its cron schedule", async () => {
    await createJob({ triggeredBy: "api", type: "sync-printers" });
    let runCount = 0;
    const schedule = {
      cron: "0 0 * * *",
      retry: { initialDelayMs: 0, maxAttempts: 1, maxDelayMs: 0, multiplier: 1 },
      run: async () => {
        runCount += 1;
        return ok({ synced: 1 });
      },
      runOnStartup: false,
      type: "sync-printers",
    };

    const executions = await startPendingApiJobs(useCases, [schedule], createScheduleRunner(useCases));
    await Promise.all(executions);

    expect(runCount).toBe(1);
    expect(await useCases.getJobs({ type: ["sync-printers"] })).toMatchObject({
      isOk: true,
      value: [{ status: "completed", triggeredBy: "api" }],
    });
  });

  test("starts a pending CLI-triggered job the same way as an API-triggered one", async () => {
    await createJob({ triggeredBy: "cli", type: "sync-labels" });
    let runCount = 0;
    const schedule = {
      cron: "0 0 * * *",
      retry: { initialDelayMs: 0, maxAttempts: 1, maxDelayMs: 0, multiplier: 1 },
      run: async () => {
        runCount += 1;
        return ok({ synced: 1 });
      },
      runOnStartup: false,
      type: "sync-labels",
    };

    const executions = await startPendingApiJobs(useCases, [schedule], createScheduleRunner(useCases));
    await Promise.all(executions);

    expect(runCount).toBe(1);
    expect(await useCases.getJobs({ type: ["sync-labels"] })).toMatchObject({
      isOk: true,
      value: [{ status: "completed", triggeredBy: "cli" }],
    });
  });

  test("polls for API-triggered work added after the worker starts", async () => {
    let markRunStarted: (() => void) | undefined;
    const runStarted = new Promise<void>((resolve) => {
      markRunStarted = resolve;
    });
    let markInitialPollComplete: (() => void) | undefined;
    const initialPollComplete = new Promise<void>((resolve) => {
      markInitialPollComplete = resolve;
    });
    const workerUseCases = {
      ...useCases,
      getJobs: async (input: GetJobsInput) => {
        const result = await useCases.getJobs(input);
        if (input.triggeredBy?.includes("api")) markInitialPollComplete?.();
        return result;
      },
    };
    const schedule = {
      cron: "0 0 1 1 *",
      retry: { initialDelayMs: 0, maxAttempts: 1, maxDelayMs: 0, multiplier: 1 },
      run: async () => {
        markRunStarted?.();
        return ok({ synced: 1 });
      },
      runOnStartup: false,
      type: "sync-printers",
    };
    const worker = startJobsWorker(workerUseCases, [schedule]);

    try {
      await initialPollComplete;
      await createJob({ triggeredBy: "api", type: "sync-printers" });
      await Promise.race([
        runStarted,
        Bun.sleep(2_500).then(() => {
          throw new Error("Worker did not pick up the API-triggered job");
        }),
      ]);
    } finally {
      await worker.stop();
    }

    expect(await useCases.getJobs({ type: ["sync-printers"] })).toMatchObject({
      isOk: true,
      value: [{ status: "completed", triggeredBy: "api" }],
    });
  });

  test("leaves API-triggered work pending while its job type is running, then starts it afterward", async () => {
    await createJob({ triggeredBy: "api", type: "sync-printers" });
    await createJob({ triggeredBy: "api", type: "sync-printers" });

    let finishFirstRun: (() => void) | undefined;
    let markFirstRunStarted: (() => void) | undefined;
    const firstRunStarted = new Promise<void>((resolve) => {
      markFirstRunStarted = resolve;
    });
    const firstRunBlocked = new Promise<void>((resolve) => {
      finishFirstRun = resolve;
    });
    let runCount = 0;
    const schedule = {
      cron: "0 0 * * *",
      retry: { initialDelayMs: 0, maxAttempts: 1, maxDelayMs: 0, multiplier: 1 },
      run: async () => {
        runCount += 1;
        if (runCount === 1) {
          markFirstRunStarted?.();
          await firstRunBlocked;
        }
        return ok({ synced: 1 });
      },
      runOnStartup: false,
      type: "sync-printers",
    };
    const runner = createScheduleRunner(useCases);
    const firstExecution = runner.run(schedule);
    await firstRunStarted;

    expect(await startPendingApiJobs(useCases, [schedule], runner)).toEqual([]);
    expect(runCount).toBe(1);

    finishFirstRun?.();
    await firstExecution;
    const queuedExecutions = await startPendingApiJobs(useCases, [schedule], runner);
    await Promise.all(queuedExecutions);

    expect(runCount).toBe(2);
    expect(await useCases.getJobs({ type: ["sync-printers"] })).toMatchObject({
      isOk: true,
      value: [{ status: "completed" }, { status: "completed" }],
    });
  });

  test("retries failed scheduled work with exponential backoff and records completion", async () => {
    let runCount = 0;
    await runScheduledJob(useCases, {
      cron: "* * * * *",
      retry: { initialDelayMs: 1, maxAttempts: 3, maxDelayMs: 10, multiplier: 2 },
      run: async () => {
        runCount += 1;
        return runCount < 3 ? err(new Error("temporary failure")) : ok({ synced: 5 });
      },
      runOnStartup: false,
      type: "sync-printers",
    });

    const result = await useCases.getJobs({ type: ["sync-printers"] });
    expect(runCount).toBe(3);
    expect(result).toMatchObject({
      isOk: true,
      value: [{ attempts: 3, error: null, result: { synced: 5 }, status: "completed" }],
    });
  });

  test("marks a job failed after its retry limit is exhausted", async () => {
    await runScheduledJob(useCases, {
      cron: "* * * * *",
      retry: { initialDelayMs: 0, maxAttempts: 2, maxDelayMs: 0, multiplier: 2 },
      run: async () => err(new Error("permanent failure")),
      runOnStartup: false,
      type: "sync-printers",
    });

    expect(await useCases.getJobs({ type: ["sync-printers"] })).toMatchObject({
      isOk: true,
      value: [{ attempts: 2, error: "permanent failure", status: "failed" }],
    });
  });

  test("a starting worker marks jobs left in progress by a stopped worker as failed", async () => {
    const stale = await createJob({ type: "sync-printers" });
    await useCases.claimNextJob(stale.type);
    const worker = startJobsWorker(useCases, [
      {
        cron: "0 0 1 1 *",
        retry: { initialDelayMs: 0, maxAttempts: 1, maxDelayMs: 0, multiplier: 1 },
        run: async () => ok({ synced: 1 }),
        runOnStartup: false,
        type: "sync-printers",
      },
    ]);
    await worker.stop();

    expect(await useCases.getJobs({ id: [stale.id] })).toMatchObject({
      isOk: true,
      value: [{ error: "Previous worker stopped before completing the job", status: "failed" }],
    });
  });

  test("claimNextJob claims a pending job of the requested type", async () => {
    await createJob({ type: "sync-labels" });
    const job = await createJob({ type: "sync-printers" });

    const claimed = await useCases.claimNextJob("sync-printers");

    expect(claimed).toMatchObject({ isOk: true, value: { attempts: 1, id: job.id, status: "in_progress" } });
    if (claimed.isOk && claimed.value) {
      expect(claimed.value.startedAt).toBeInstanceOf(Date);
      expect(claimed.value.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(await useCases.claimNextJob("sync-printers")).toEqual({ isOk: true, value: null });
    expect(await useCases.getJobs({ type: ["sync-labels"] })).toMatchObject({
      isOk: true,
      value: [{ status: "pending" }],
    });
  });

  test("updateJobs stores completion state and exposes elapsed duration", async () => {
    const job = await createJob();
    const claimed = await useCases.claimNextJob(job.type);
    expect(claimed.isOk && claimed.value).toBeTruthy();
    await Bun.sleep(5);
    const result = await useCases.updateJobs([{ id: job.id, result: { synced: 3 }, status: "completed" }]);

    expect(result).toMatchObject({ isOk: true, value: [{ id: job.id, result: { synced: 3 }, status: "completed" }] });
    if (result.isOk) expect(result.value[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("deleteJobs is idempotent", async () => {
    const job = await createJob();
    const ids = [job.id, `missing-${crypto.randomUUID()}`];

    expect(await useCases.deleteJobs(ids)).toEqual({ isOk: true, value: undefined });
    expect(await useCases.deleteJobs(ids)).toEqual({ isOk: true, value: undefined });
    expect(await useCases.getJobs({ id: [job.id] })).toEqual({ isOk: true, value: [] });
  });
});
