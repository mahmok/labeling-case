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

type ScheduleRunner = (schedule: ScheduledJob) => Promise<void>;

const retryDelay = (attempt: number, policy: RetryPolicyConfig): number =>
  Math.min(policy.maxDelayMs, policy.initialDelayMs * policy.multiplier ** (attempt - 1));

const updateJob = async (useCases: JobsUseCases, input: UpdateJobInput): Promise<Result<void, Error>> => {
  const result = await useCases.updateJobs([input]);
  return result.isOk ? ok() : result;
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
      logger.info({ attempt, jobId: job.id, jobType: schedule.type, msg: "Scheduled job completed" });
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
      logger.error({ attempt, error: message, jobId: job.id, jobType: schedule.type, msg: "Scheduled job failed" });
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
  const recovered = await recoverInterruptedJobs(useCases, schedule.type);
  if (!recovered.isOk) return recovered;

  const claimed = await claimPendingJob(useCases, schedule.type);
  if (!claimed.isOk) return claimed;
  if (!claimed.value) {
    logger.info({ jobType: schedule.type, msg: "No pending job was available" });
    return ok();
  }

  return runAttempts(useCases, claimed.value, schedule);
};

export const createScheduleRunner = (useCases: JobsUseCases): ScheduleRunner => {
  const activeTypes = new Set<string>();

  return async (schedule: ScheduledJob): Promise<void> => {
    if (activeTypes.has(schedule.type)) {
      logger.info({ jobType: schedule.type, msg: "Skipped scheduled job because it is already running" });
      return;
    }

    activeTypes.add(schedule.type);
    try {
      const result = await runScheduledJob(useCases, schedule);
      if (!result.isOk) logger.error({ error: result.error, jobType: schedule.type, msg: "Scheduled job failed" });
    } catch (error) {
      logger.error({ error, jobType: schedule.type, msg: "Scheduled job crashed" });
    } finally {
      activeTypes.delete(schedule.type);
    }
  };
};

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

export const startJobsWorker = (useCases: JobsUseCases, schedules: ScheduledJob[]): JobsWorker => {
  validateRetryPolicies(schedules);
  const runSchedule = createScheduleRunner(useCases);
  const activeRuns = new Set<Promise<void>>();
  const run = (schedule: ScheduledJob): Promise<void> => {
    let execution: Promise<void>;
    execution = runSchedule(schedule).finally(() => activeRuns.delete(execution));
    activeRuns.add(execution);
    return execution;
  };

  const cronJobs = schedules.map((schedule) => Bun.cron(schedule.cron, () => run(schedule)));
  for (const schedule of schedules) {
    if (schedule.runOnStartup) void run(schedule);
  }

  return {
    async stop(): Promise<void> {
      for (const cronJob of cronJobs) cronJob.stop();
      await Promise.all(activeRuns);
    },
  };
};
