import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { config } from "../config.ts";
import { responseError } from "../lib/api-utils.ts";
import { asError, err, ok, type Result } from "../lib/result.ts";

const TRAILING_SLASH = /\/$/;

export type ServiceHealth = { status: "running" };

export const healthKeys = {
  all: ["health"] as const,
  labelingApi: () => [...healthKeys.all, "api"] as const,
  labelingWorker: () => [...healthKeys.all, "worker"] as const,
};

export const getLabelingApiHealth = async (signal?: AbortSignal): Promise<Result<ServiceHealth, Error>> => {
  try {
    const baseUrl = config.labelingBaseUrl.replace(TRAILING_SLASH, "");
    const response = await fetch(`${baseUrl}/health`, { signal });
    if (!response.ok) return err<ServiceHealth, Error>(await responseError(response));
    const health = (await response.json()) as ServiceHealth;
    return health.status === "running"
      ? ok(health)
      : err<ServiceHealth, Error>(new Error("Labeling API health check returned an unexpected status"));
  } catch (error) {
    return err<ServiceHealth, Error>(asError(error));
  }
};

export const getLabelingWorkerHealth = async (signal?: AbortSignal): Promise<Result<ServiceHealth, Error>> => {
  try {
    const baseUrl = config.labelingWorkerBaseUrl.replace(TRAILING_SLASH, "");
    const response = await fetch(`${baseUrl}/health`, { signal });
    if (!response.ok) return err<ServiceHealth, Error>(await responseError(response));
    const health = (await response.json()) as ServiceHealth;
    return health.status === "running"
      ? ok(health)
      : err<ServiceHealth, Error>(new Error("Labeling worker health check returned an unexpected status"));
  } catch (error) {
    return err<ServiceHealth, Error>(asError(error));
  }
};

export const useLabelingApiHealth = (): UseQueryResult<Result<ServiceHealth, Error>, Error> =>
  useQuery({
    queryFn: ({ signal }: { signal: AbortSignal }) => getLabelingApiHealth(signal),
    queryKey: healthKeys.labelingApi(),
    refetchInterval: 30_000,
  });

export const useLabelingWorkerHealth = (): UseQueryResult<Result<ServiceHealth, Error>, Error> =>
  useQuery({
    queryFn: ({ signal }: { signal: AbortSignal }) => getLabelingWorkerHealth(signal),
    queryKey: healthKeys.labelingWorker(),
    refetchInterval: 30_000,
  });
