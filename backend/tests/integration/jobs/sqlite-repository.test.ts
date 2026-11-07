import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { config } from "../../../src/config.ts";
import { createDatabase } from "../../../src/db";
import type { SQLiteTransaction } from "../../../src/db/sqlite/unit-of-work.ts";
import type { UnitOfWork } from "../../../src/db/unit-of-work.ts";
import type { CreateJobInput, GetJobsInput, Job, UpdateJobInput } from "../../../src/jobs";
import { SQLiteJobsRepository } from "../../../src/jobs/repository/sqlite.ts";

let unitOfWork: UnitOfWork<SQLiteTransaction>;
let closeDatabase: () => Promise<void> = async () => {};

const createJob = async (overrides: Partial<CreateJobInput> = {}): Promise<Job> => {
  const result = await unitOfWork.execute((tx) =>
    SQLiteJobsRepository.create([{ type: `sync-${crypto.randomUUID()}`, ...overrides }], tx),
  );
  if (!result.isOk) throw result.error;
  const job = result.value[0];
  if (!job) throw new Error("Expected job creation to return a row");
  return job;
};

const getJobs = async (input: GetJobsInput): Promise<Job[]> => {
  const result = await unitOfWork.execute((tx) => SQLiteJobsRepository.get(input, tx));
  if (!result.isOk) throw result.error;
  return result.value;
};

const claimNext = async (type: string): Promise<Job | null> => {
  const result = await unitOfWork.execute((tx) => SQLiteJobsRepository.claimNext(type, tx));
  if (!result.isOk) throw result.error;
  return result.value;
};

describe("SQLiteJobsRepository", () => {
  beforeAll(async () => {
    config.database.dialect = "sqlite";
    const database = await createDatabase();
    if (database.dialect !== "sqlite") throw new Error("Expected SQLite database");
    unitOfWork = database.uow;
    closeDatabase = database.close;
  });

  beforeEach(async () => {
    const existing = await getJobs({});
    if (existing.length === 0) return;
    const result = await unitOfWork.execute((tx) =>
      SQLiteJobsRepository.delete(
        existing.map(({ id }) => id),
        tx,
      ),
    );
    if (!result.isOk) throw result.error;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("creates jobs with pending state, system trigger, and no start time", async () => {
    const job = await createJob({ type: "sync-printers" });

    expect(job).toMatchObject({
      attempts: 0,
      durationMs: null,
      error: null,
      result: null,
      startedAt: null,
      status: "pending",
      triggeredBy: "system",
      type: "sync-printers",
    });
    expect(job.createdAt).toBeInstanceOf(Date);
    expect(job.updatedAt).toBeInstanceOf(Date);
  });

  test("retrieves jobs by ID and filters by type and status", async () => {
    const target = await createJob({ type: "sync-labels" });
    await createJob({ type: "sync-printers" });

    expect(await getJobs({ id: [target.id] })).toEqual([target]);
    expect(await getJobs({ status: ["pending"], type: ["sync-labels"] })).toEqual([target]);
  });

  test("sorts and paginates filtered jobs", async () => {
    const type = `sync-${crypto.randomUUID()}`;
    const jobs: Job[] = [];
    for (const suffix of ["c", "a", "b"]) jobs.push(await createJob({ type: `${type}-${suffix}` }));

    const result = await getJobs({
      pagination: { limit: 1, offset: 1 },
      sorting: [{ direction: "ASC", key: "type" }],
      type: jobs.map(({ type: jobType }) => jobType),
    });

    expect(result.map(({ type: jobType }) => jobType)).toEqual([`${type}-b`]);
  });

  test("updates completion state and returns elapsed duration from startedAt", async () => {
    const job = await createJob();
    const started = await claimNext(job.type);
    if (!started) throw new Error("Expected job claim to return a row");
    await Bun.sleep(10);

    const result = { source: "vendor", synced: 4 };
    const updated = await unitOfWork.execute((tx) =>
      SQLiteJobsRepository.update([{ id: job.id, result, status: "completed" }], tx),
    );
    if (!updated.isOk) throw updated.error;
    const [completed] = updated.value;

    expect(completed).toMatchObject({ id: job.id, result, status: "completed" });
    expect(completed?.startedAt).toEqual(started.startedAt);
    expect(completed?.durationMs).toBeGreaterThanOrEqual(1);
  });

  test("records a terminal job failure", async () => {
    const job = await createJob();
    const updated = await unitOfWork.execute((tx) =>
      SQLiteJobsRepository.update([{ error: "vendor unavailable", id: job.id, status: "failed" }], tx),
    );
    if (!updated.isOk) throw updated.error;

    expect(updated.value).toMatchObject([{ error: "vendor unavailable", id: job.id, status: "failed" }]);
  });

  test("claims pending jobs of the requested type once and sets startedAt", async () => {
    await createJob({ type: "sync-labels" });
    const first = await createJob({ type: "sync-printers" });
    await Bun.sleep(5);
    const second = await createJob({ type: "sync-printers" });

    const firstClaim = await claimNext("sync-printers");
    const secondClaim = await claimNext("sync-printers");
    const thirdClaim = await claimNext("sync-printers");

    expect(firstClaim?.id).toBe(first.id);
    expect(firstClaim).toMatchObject({ attempts: 1, status: "in_progress" });
    expect(firstClaim?.startedAt).toBeInstanceOf(Date);
    expect(firstClaim?.durationMs).toBeGreaterThanOrEqual(0);
    expect(secondClaim?.id).toBe(second.id);
    expect(secondClaim).toMatchObject({ attempts: 1, status: "in_progress" });
    expect(thirdClaim).toBeNull();
    expect((await getJobs({ type: ["sync-labels"] }))[0]?.status).toBe("pending");
  });

  test("deletes only requested jobs", async () => {
    const target = await createJob();
    const retained = await createJob();
    const deleted = await unitOfWork.execute((tx) => SQLiteJobsRepository.delete([target.id], tx));
    if (!deleted.isOk) throw deleted.error;

    expect(await getJobs({ id: [target.id] })).toEqual([]);
    expect(await getJobs({ id: [retained.id] })).toEqual([retained]);
  });

  test("rejects duplicate IDs in a batch update", async () => {
    const job = await createJob();
    const result = await unitOfWork.execute((tx) =>
      SQLiteJobsRepository.update(
        [
          { id: job.id, status: "completed" },
          { id: job.id, status: "failed" },
        ] satisfies UpdateJobInput[],
        tx,
      ),
    );

    expect(result.isOk).toBe(false);
    expect(await getJobs({ id: [job.id] })).toEqual([job]);
  });
});
