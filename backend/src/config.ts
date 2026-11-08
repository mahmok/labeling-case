export type RetryPolicyConfig = {
  maxAttempts: number;
  initialDelayMs: number;
  multiplier: number;
  maxDelayMs: number;
};

export type ScheduledJobConfig = {
  cron: string;
  runOnStartup: boolean;
  retry: RetryPolicyConfig;
};

export interface Config {
  api: {
    port: number;
  };
  database: {
    connectionTimeoutMs: number;
    name: string;
    host: string;
    port: number;
    user: string;
    password: string;
    dialect: "postgresql" | "sqlite";
  };
  jobs: {
    labels: ScheduledJobConfig;
    printers: ScheduledJobConfig;
    backfillPrints: ScheduledJobConfig;
    workerPort: number;
  };
  logger: {
    destination: "stdout" | "stderr";
    level: string;
  };
}

type Mapper<T> = (value: string) => T;

const booleanMapper: Mapper<boolean> = (value: string): boolean => value.toLowerCase() === "true";

const getEnvVar = (key: string): string | undefined => {
  if (typeof Bun !== "undefined") {
    return Bun.env[key];
  }
  return process.env[key];
};

const _getRequiredEnvVar = <T = string>(key: string, map?: Mapper<T>): T => {
  const value = getEnvVar(key);

  if (!value?.trim()) {
    throw new Error(`${key} must be set`);
  }

  return map ? map(value) : (value as T);
};

const getOptionalEnvVar = <T = string>(key: string, fallback: T, map?: Mapper<T>): T => {
  const value = getEnvVar(key);

  if (!value?.trim()) {
    return fallback;
  }

  return map ? map(value) : (value as T);
};

export const config: Config = {
  api: {
    port: getOptionalEnvVar("PORT", 3000, Number),
  },
  database: {
    connectionTimeoutMs: getOptionalEnvVar("DATABASE_CONNECTION_TIMEOUT_MS", 5000, Number),
    dialect: getOptionalEnvVar("DATABASE_DIALECT", "postgresql") as "postgresql" | "sqlite",
    host: getOptionalEnvVar("DATABASE_HOST", "localhost"),
    name: getOptionalEnvVar("DATABASE_NAME", "labeling"),
    password: getOptionalEnvVar("DATABASE_PASS", "labeling"),
    port: getOptionalEnvVar("DATABASE_PORT", 5432, Number),
    user: getOptionalEnvVar("DATABASE_USER", "labeling"),
  },
  jobs: {
    backfillPrints: {
      cron: getOptionalEnvVar("JOBS_BACKFILL_PRINTS_CRON", "* * * * *"),
      retry: {
        initialDelayMs: getOptionalEnvVar("JOBS_BACKFILL_PRINTS_RETRY_INITIAL_DELAY_MS", 1000, Number),
        maxAttempts: getOptionalEnvVar("JOBS_BACKFILL_PRINTS_RETRY_MAX_ATTEMPTS", 5, Number),
        maxDelayMs: getOptionalEnvVar("JOBS_BACKFILL_PRINTS_RETRY_MAX_DELAY_MS", 60_000, Number),
        multiplier: getOptionalEnvVar("JOBS_BACKFILL_PRINTS_RETRY_MULTIPLIER", 2, Number),
      },
      runOnStartup: getOptionalEnvVar("JOBS_BACKFILL_PRINTS_RUN_ON_STARTUP", false, booleanMapper),
    },
    labels: {
      cron: getOptionalEnvVar("JOBS_LABELS_CRON", "*/5 * * * *"),
      retry: {
        initialDelayMs: getOptionalEnvVar("JOBS_LABELS_RETRY_INITIAL_DELAY_MS", 1000, Number),
        maxAttempts: getOptionalEnvVar("JOBS_LABELS_RETRY_MAX_ATTEMPTS", 5, Number),
        maxDelayMs: getOptionalEnvVar("JOBS_LABELS_RETRY_MAX_DELAY_MS", 60_000, Number),
        multiplier: getOptionalEnvVar("JOBS_LABELS_RETRY_MULTIPLIER", 2, Number),
      },
      runOnStartup: getOptionalEnvVar("JOBS_LABELS_RUN_ON_STARTUP", true, booleanMapper),
    },
    printers: {
      cron: getOptionalEnvVar("JOBS_PRINTERS_CRON", "* * * * *"),
      retry: {
        initialDelayMs: getOptionalEnvVar("JOBS_PRINTERS_RETRY_INITIAL_DELAY_MS", 1000, Number),
        maxAttempts: getOptionalEnvVar("JOBS_PRINTERS_RETRY_MAX_ATTEMPTS", 5, Number),
        maxDelayMs: getOptionalEnvVar("JOBS_PRINTERS_RETRY_MAX_DELAY_MS", 60_000, Number),
        multiplier: getOptionalEnvVar("JOBS_PRINTERS_RETRY_MULTIPLIER", 2, Number),
      },
      runOnStartup: getOptionalEnvVar("JOBS_PRINTERS_RUN_ON_STARTUP", true, booleanMapper),
    },
    workerPort: getOptionalEnvVar("JOBS_WORKER_PORT", 3001, Number),
  },
  logger: {
    destination: getOptionalEnvVar("LOG_DESTINATION", "stdout") as "stdout" | "stderr",
    level: getOptionalEnvVar("LOG_LEVEL", "debug"),
  },
};
