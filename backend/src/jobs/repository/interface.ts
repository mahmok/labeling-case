import type { Result } from "../../utils/result.ts";
import type { Job, JobResult, JobStatus } from "../domain.ts";

export type CreateJobInput = {
  type: string;
  triggeredBy?: string;
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

export type GetJobsInput = {
  id?: string[];
  type?: string[];
  status?: JobStatus[];
  triggeredBy?: string[];
  pagination?: { limit: number; offset: number };
  sorting?: { key: JobSortKey; direction: "ASC" | "DESC" }[];
};

export type UpdateJobInput = {
  id: string;
  attempts?: number;
  status?: JobStatus;
  result?: JobResult | null;
  error?: string | null;
};

export interface JobsRepository<T> {
  claimNext: (type: string, tx: T) => Promise<Result<Job | null, Error>>;
  create: (input: CreateJobInput[], tx: T) => Promise<Result<Job[], Error>>;
  delete: (ids: string[], tx: T) => Promise<Result<void, Error>>;
  get: (input: GetJobsInput, tx: T) => Promise<Result<Job[], Error>>;
  update: (input: UpdateJobInput[], tx: T) => Promise<Result<Job[], Error>>;
}
