export interface Config {
  api: {
    port: number;
  };
  database: {
    name: string;
    host: string;
    port: number;
    user: string;
    password: string;
    dialect: "postgresql" | "sqlite";
  };
  logger: {
    level: string;
  };
}

type Mapper<T> = (value: string) => T;

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
    dialect: getOptionalEnvVar("DATABASE_DIALECT", "postgresql") as "postgresql" | "sqlite",
    host: getOptionalEnvVar("DATABASE_HOST", "localhost"),
    name: getOptionalEnvVar("DATABASE_NAME", "labeling"),
    password: getOptionalEnvVar("DATABASE_PASS", "labeling"),
    port: getOptionalEnvVar("DATABASE_PORT", 5432, Number),
    user: getOptionalEnvVar("DATABASE_USER", "labeling"),
  },
  logger: {
    level: getOptionalEnvVar("LOG_LEVEL", "debug"),
  },
};
