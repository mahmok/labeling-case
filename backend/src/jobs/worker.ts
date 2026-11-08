import type { RetryPolicyConfig } from "../config.ts";
import { logger } from "../logger";
import { asError, err, ok, type Result } from "../utils/result.ts";
import type { Job, JobResult } from "./domain.ts";
import type { UpdateJobInput } from "./repository/interface.ts";
import type { JobsUseCases } from "./use-cases.ts";

export type ScheduledJob = {
  type: string;
  cron: string;
  runOnStartup: boolean;
  retry: RetryPolicyConfig;
  run: () => Promise<Result<JobResult, Error>>;
};

export type JobsWorker = {
  stop: () => Promise<void>;
};

type ScheduleRunner = {
  isRunning: (type: string) => Promise<Result<boolean, Error>>;
  run: (schedule: ScheduledJob) => Promise<void>;
};

const API_JOB_POLL_INTERVAL_MS = 1_000;

const retryDelay = (attempt: number, policy: RetryPolicyConfig): number =>
  Math.min(policy.maxDelayMs, policy.initialDelayMs * policy.multiplier ** (attempt - 1));

const updateJob = async (useCases: JobsUseCases, input: UpdateJobInput): Promise<Result<Job, Error>> => {
  const result = await useCases.updateJobs([input]);
  if (!result.isOk) return result;
  const [job] = result.value;
  return job ? ok(job) : err(new Error("Job use case returned no updated job"));
};

const recoverInterruptedJobs = async (useCases: JobsUseCases, type: string): Promise<Result<void, Error>> => {
  const inProgress = await useCases.getJobs({ status: ["in_progress"], type: [type] });
  if (!inProgress.isOk) return inProgress;
  if (inProgress.value.length === 0) return ok();

  const recovered = await useCases.updateJobs(
    inProgress.value.map(({ id }) => ({
      error: "Previous worker stopped before completing the job",
      id,
      status: "failed",
    })),
  );
  return recovered.isOk ? ok() : recovered;
};

const isJobTypeRunning = async (useCases: JobsUseCases, type: string): Promise<Result<boolean, Error>> => {
  const running = await useCases.getJobs({
    pagination: { limit: 1, offset: 0 },
    status: ["in_progress"],
    type: [type],
  });
  return running.isOk ? ok(running.value.length > 0) : running;
};

const claimPendingJob = async (useCases: JobsUseCases, type: string): Promise<Result<Job | null, Error>> => {
  const pending = await useCases.getJobs({
    pagination: { limit: 1, offset: 0 },
    sorting: [{ direction: "ASC", key: "createdAt" }],
    status: ["pending"],
    type: [type],
  });
  if (!pending.isOk) return pending;

  if (pending.value.length === 0) {
    const created = await useCases.createJobs([{ type }]);
    if (!created.isOk) return created;
    if (!created.value[0]) return err(new Error("Job repository returned no created job"));
  }

  return useCases.claimNextJob(type);
};

const runAttempts = async (useCases: JobsUseCases, job: Job, schedule: ScheduledJob): Promise<Result<void, Error>> => {
  const maxAttempts = Math.max(1, Math.floor(schedule.retry.maxAttempts));

  for (let attempt: number = job.attempts; attempt <= maxAttempts; attempt += 1) {
    const outcome = await Promise.resolve()
      .then(schedule.run)
      .catch((failure: unknown) => err<JobResult, Error>(asError(failure)));

    if (outcome.isOk) {
      const completed = await updateJob(useCases, {
        error: null,
        id: job.id,
        result: outcome.value,
        status: "completed",
      });
      if (!completed.isOk) return completed;
      logger.info({
        attempt,
        durationMs: completed.value.durationMs,
        jobId: job.id,
        jobType: schedule.type,
        msg: "Scheduled job completed",
      });
      return ok();
    }

    const message = outcome.error.message;
    if (attempt >= maxAttempts) {
      const failed = await updateJob(useCases, {
        attempts: attempt,
        error: message,
        id: job.id,
        status: "failed",
      });
      if (!failed.isOk) return failed;
      logger.error({
        attempt,
        durationMs: failed.value.durationMs,
        error: message,
        jobId: job.id,
        jobType: schedule.type,
        msg: "Scheduled job failed",
      });
      return ok();
    }

    const nextAttempt = attempt + 1;
    const retrying = await updateJob(useCases, {
      attempts: nextAttempt,
      error: message,
      id: job.id,
      status: "in_progress",
    });
    if (!retrying.isOk) return retrying;

    const delay = retryDelay(attempt, schedule.retry);
    logger.warn({
      attempt,
      delay,
      error: message,
      jobId: job.id,
      jobType: schedule.type,
      msg: "Retrying scheduled job",
    });
    await Bun.sleep(delay);
  }

  return err(new Error(`Scheduled job ${job.id} finished without a result`));
};

export const runScheduledJob = async (useCases: JobsUseCases, schedule: ScheduledJob): Promise<Result<void, Error>> => {
  const running = await isJobTypeRunning(useCases, schedule.type);
  if (!running.isOk) return running;
  if (running.value) {
    logger.info({ jobType: schedule.type, msg: "Skipped scheduled job because it is already running" });
    return ok();
  }

  const claimed = await claimPendingJob(useCases, schedule.type);
  if (!claimed.isOk) return claimed;
  if (!claimed.value) {
    logger.info({ jobType: schedule.type, msg: "No job was claimed (none pending or the type is already running)" });
    return ok();
  }

  return runAttempts(useCases, claimed.value, schedule);
};

export const startPendingApiJobs = async (
  useCases: JobsUseCases,
  schedules: ScheduledJob[],
  runSchedule: ScheduleRunner,
): Promise<Promise<void>[]> => {
  const executions: Promise<void>[] = [];

  for (const schedule of schedules) {
    const running = await runSchedule.isRunning(schedule.type);
    if (!running.isOk) {
      logger.error({ error: running.error, jobType: schedule.type, msg: "Failed to check for running jobs" });
      continue;
    }
    if (running.value) continue;

    const pending = await useCases.getJobs({
      pagination: { limit: 1, offset: 0 },
      status: ["pending"],
      triggeredBy: ["api"],
      type: [schedule.type],
    });
    if (!pending.isOk) {
      logger.error({ error: pending.error, jobType: schedule.type, msg: "Failed to check for API-triggered jobs" });
      continue;
    }
    if (pending.value.length > 0) executions.push(runSchedule.run(schedule));
  }

  return executions;
};

export const createScheduleRunner = (useCases: JobsUseCases): ScheduleRunner => ({
  isRunning: (type: string): Promise<Result<boolean, Error>> => isJobTypeRunning(useCases, type),
  async run(schedule: ScheduledJob): Promise<void> {
    try {
      const result = await runScheduledJob(useCases, schedule);
      if (!result.isOk) logger.error({ error: result.error, jobType: schedule.type, msg: "Scheduled job failed" });
    } catch (error) {
      logger.error({ error, jobType: schedule.type, msg: "Scheduled job crashed" });
    }
  },
});

const validateRetryPolicies = (schedules: ScheduledJob[]): void => {
  for (const { type, retry } of schedules) {
    if (!Number.isInteger(retry.maxAttempts) || retry.maxAttempts < 1) {
      throw new Error(`Retry maxAttempts for ${type} must be a positive integer`);
    }
    if (!Number.isFinite(retry.initialDelayMs) || retry.initialDelayMs < 0) {
      throw new Error(`Retry initialDelayMs for ${type} must be non-negative`);
    }
    if (!Number.isFinite(retry.multiplier) || retry.multiplier < 1) {
      throw new Error(`Retry multiplier for ${type} must be at least one`);
    }
    if (!Number.isFinite(retry.maxDelayMs) || retry.maxDelayMs < retry.initialDelayMs) {
      throw new Error(`Retry maxDelayMs for ${type} must be at least initialDelayMs`);
    }
  }
};

const recoverAllInterruptedJobs = async (useCases: JobsUseCases, schedules: ScheduledJob[]): Promise<void> => {
  for (const { type } of schedules) {
    try {
      const recovered = await recoverInterruptedJobs(useCases, type);
      if (!recovered.isOk) logger.error({ error: recovered.error, jobType: type, msg: "Failed to recover jobs" });
    } catch (error) {
      logger.error({ error, jobType: type, msg: "Failed to recover jobs" });
    }
  }
};

export const startJobsWorker = (useCases: JobsUseCases, schedules: ScheduledJob[]): JobsWorker => {
  validateRetryPolicies(schedules);
  const scheduleRunner = createScheduleRunner(useCases);
  const recovery = recoverAllInterruptedJobs(useCases, schedules);
  const activeRuns = new Set<Promise<void>>();
  const run = (schedule: ScheduledJob): Promise<void> => {
    let execution: Promise<void>;
    execution = recovery.then(() => scheduleRunner.run(schedule)).finally(() => activeRuns.delete(execution));
    activeRuns.add(execution);
    return execution;
  };
  const trackedRunner: ScheduleRunner = { isRunning: scheduleRunner.isRunning, run };

  let polling: Promise<void> | undefined;
  const pollApiJobs = (): Promise<void> => {
    if (polling !== undefined) return polling;
    polling = (async () => {
      try {
        await recovery;
        const executions = await startPendingApiJobs(useCases, schedules, trackedRunner);
        for (const execution of executions) void execution;
      } catch (error) {
        logger.error({ error, msg: "Failed to poll for API-triggered jobs" });
      }
    })().finally(() => {
      polling = undefined;
    });
    return polling;
  };

  const apiJobPoll = setInterval(() => void pollApiJobs(), API_JOB_POLL_INTERVAL_MS);
  void pollApiJobs();
  const cronJobs = schedules.map((schedule) => Bun.cron(schedule.cron, () => run(schedule)));
  for (const schedule of schedules) {
    if (schedule.runOnStartup) void run(schedule);
  }

  return {
    async stop(): Promise<void> {
      clearInterval(apiJobPoll);
      for (const cronJob of cronJobs) cronJob.stop();
      await recovery;
      await polling;
      await Promise.all(activeRuns);
    },
  };
};
