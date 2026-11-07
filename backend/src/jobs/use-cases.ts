import type { UnitOfWork } from "../db/unit-of-work.ts";
import { notFoundError } from "../utils/errors.ts";
import { err, type Result } from "../utils/result.ts";
import type { Job } from "./domain.ts";
import type { CreateJobInput, GetJobsInput, JobsRepository, UpdateJobInput } from "./repository/interface.ts";

export type Dependencies<T> = {
  uow: UnitOfWork<T>;
  repository: JobsRepository<T>;
};

export type JobsUseCases = {
  createJobs: (inputs: CreateJobInput[]) => Promise<Result<Job[], Error>>;
  getJobs: (input: GetJobsInput) => Promise<Result<Job[], Error>>;
  claimNextJob: (type: string) => Promise<Result<Job | null, Error>>;
  updateJobs: (inputs: UpdateJobInput[]) => Promise<Result<Job[], Error>>;
  deleteJobs: (ids: string[]) => Promise<Result<void, Error>>;
};

export const createJobs =
  <T>({ repository, uow }: Dependencies<T>) =>
  (inputs: CreateJobInput[]): Promise<Result<Job[], Error>> =>
    uow.execute(async (tx) => {
      const created = await repository.create(inputs, tx);
      if (!created.isOk) return created;
      if (created.value.length !== inputs.length) {
        return err(new Error("Job repository returned an unexpected number of created jobs"));
      }
      return created;
    });

export const getJobs =
  <T>({ repository, uow }: Dependencies<T>) =>
  (input: GetJobsInput): Promise<Result<Job[], Error>> =>
    uow.execute((tx) => repository.get(input, tx));

export const claimNextJob =
  <T>({ repository, uow }: Dependencies<T>) =>
  (type: string): Promise<Result<Job | null, Error>> =>
    uow.execute((tx) => repository.claimNext(type, tx));

export const updateJobs =
  <T>({ repository, uow }: Dependencies<T>) =>
  (inputs: UpdateJobInput[]): Promise<Result<Job[], Error>> =>
    uow.execute(async (tx) => {
      const updated = await repository.update(inputs, tx);
      if (!updated.isOk) return updated;

      const updatedIds = new Set(updated.value.map(({ id }) => id));
      const missing = inputs.find(({ id }) => !updatedIds.has(id));
      return missing ? err(notFoundError("Job", missing.id)) : updated;
    });

export const deleteJobs =
  <T>({ repository, uow }: Dependencies<T>) =>
  (ids: string[]): Promise<Result<void, Error>> =>
    uow.execute((tx) => repository.delete([...new Set(ids)], tx));

export const createJobUseCases = <T>(deps: Dependencies<T>): JobsUseCases => ({
  claimNextJob: claimNextJob(deps),
  createJobs: createJobs(deps),
  deleteJobs: deleteJobs(deps),
  getJobs: getJobs(deps),
  updateJobs: updateJobs(deps),
});
