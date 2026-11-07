import {
  type Query,
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { API_PREFIX, type DataResponse, responseError, toSearchParams } from "../lib/api-utils.ts";
import { asError, err, ok, type Result } from "../lib/result.ts";

export type JobStatus = "pending" | "in_progress" | "completed" | "failed";
export type JobType = "sync-printers" | "sync-labels" | "backfill-prints";
export type Job = {
  id: string;
  type: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  durationMs: number | null;
  triggeredBy: string;
  attempts: number;
  result?: Record<string, unknown> | null;
  error?: string | null;
};
export type JobSortKey =
  | "id"
  | "type"
  | "status"
  | "attempts"
  | "createdAt"
  | "updatedAt"
  | "startedAt"
  | "triggeredBy";
export type JobListParams = {
  status?: JobStatus | JobStatus[];
  type?: JobType | JobType[];
  limit?: number;
  offset?: number;
  sort?: (`+${JobSortKey}` | `-${JobSortKey}`)[];
};
export type CreateJobInput = { type: JobType };

export const jobKeys = {
  all: ["jobs"] as const,
  detail: (id: string) => [...jobKeys.details(), id] as const,
  details: () => [...jobKeys.all, "detail"] as const,
  list: (params: JobListParams = {}) => [...jobKeys.lists(), params] as const,
  lists: () => [...jobKeys.all, "list"] as const,
};

export const listJobs = async (params: JobListParams = {}, signal?: AbortSignal): Promise<Result<Job[], Error>> => {
  try {
    const response = await fetch(`${API_PREFIX}/jobs${toSearchParams(params)}`, { signal });
    if (!response.ok) return err<Job[], Error>(await responseError(response));
    const { data } = (await response.json()) as DataResponse<Job[]>;
    return ok(data);
  } catch (error) {
    return err<Job[], Error>(asError(error));
  }
};

export const getJob = async (id: string, signal?: AbortSignal): Promise<Result<Job, Error>> => {
  try {
    const response = await fetch(`${API_PREFIX}/jobs/${encodeURIComponent(id)}`, { signal });
    if (!response.ok) return err<Job, Error>(await responseError(response));
    const { data } = (await response.json()) as DataResponse<Job>;
    return ok(data);
  } catch (error) {
    return err<Job, Error>(asError(error));
  }
};

export const createJob = async (input: CreateJobInput): Promise<Result<Job, Error>> => {
  try {
    const response = await fetch(`${API_PREFIX}/jobs`, {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) return err<Job, Error>(await responseError(response));
    const { data } = (await response.json()) as DataResponse<Job>;
    return ok(data);
  } catch (error) {
    return err<Job, Error>(asError(error));
  }
};

export const useJobs = (params: JobListParams = {}): UseQueryResult<Result<Job[], Error>, Error> =>
  useQuery({
    queryFn: ({ signal }: { signal: AbortSignal }) => listJobs(params, signal),
    queryKey: jobKeys.list(params),
    refetchInterval: (query: Query<Result<Job[], Error>>): number | false =>
      query.state.data?.isOk &&
      query.state.data.value.some((job) => job.status === "pending" || job.status === "in_progress")
        ? 2_000
        : false,
  });

export const useJob = (id: string, enabled = true): UseQueryResult<Result<Job, Error>, Error> =>
  useQuery({
    enabled: enabled && id.length > 0,
    queryFn: ({ signal }: { signal: AbortSignal }) => getJob(id, signal),
    queryKey: jobKeys.detail(id),
    refetchInterval: (query: Query<Result<Job, Error>>): number | false =>
      query.state.data?.isOk &&
      (query.state.data.value.status === "pending" || query.state.data.value.status === "in_progress")
        ? 2_000
        : false,
  });

export const useCreateJob = (): UseMutationResult<Result<Job, Error>, Error, CreateJobInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createJob,
    onSuccess: async (result: Result<Job, Error>): Promise<void> => {
      if (!result.isOk) return;
      queryClient.setQueryData(jobKeys.detail(result.value.id), ok(result.value));
      await queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
};
