export interface Config {
  api: {
    port: number;
  };
  logger: {
    level: string;
  };
}

type Mapper<T> = (value: string) => T;

const _getRequiredEnvVar = <T = string>(key: string, map?: Mapper<T>): T => {
  const value = Bun.env[key];

  if (!value?.trim()) {
    throw new Error(`${key} must be set`);
  }

  return map ? map(value) : (value as T);
};

const getOptionalEnvVar = <T = string>(key: string, fallback: T, map?: Mapper<T>): T => {
  const value = Bun.env[key];

  if (!value?.trim()) {
    return fallback;
  }

  return map ? map(value) : (value as T);
};

export const config: Config = {
  api: {
    port: getOptionalEnvVar("PORT", 3000, Number),
  },
  logger: {
    level: getOptionalEnvVar("LOG_LEVEL", "debug"),
  },
};
