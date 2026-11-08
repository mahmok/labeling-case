import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { config } from "../../../src/config.ts";
import { createDatabase } from "../../../src/db";
import type { PostgresTransaction } from "../../../src/db/postgres/postgres.ts";
import type { UnitOfWork } from "../../../src/db/unit-of-work.ts";
import type { CreateJobInput, GetJobsInput, Job, UpdateJobInput } from "../../../src/jobs";
import { PostgresJobsRepository } from "../../../src/jobs/repository/postgres.ts";

let container: StartedPostgreSqlContainer | undefined;
let unitOfWork: UnitOfWork<PostgresTransaction>;
let closeDatabase: () => Promise<void> = async () => {};

const createJob = async (overrides: Partial<CreateJobInput> = {}): Promise<Job> => {
  const result = await unitOfWork.execute((tx) =>
    PostgresJobsRepository.create([{ type: `sync-${crypto.randomUUID()}`, ...overrides }], tx),
  );
  if (!result.isOk) throw result.error;
  const job = result.value[0];
  if (!job) throw new Error("Expected job creation to return a row");
  return job;
};

const getJobs = async (input: GetJobsInput): Promise<Job[]> => {
  const result = await unitOfWork.execute((tx) => PostgresJobsRepository.get(input, tx));
  if (!result.isOk) throw result.error;
  return result.value;
};

const claimNext = async (type: string): Promise<Job | null> => {
  const result = await unitOfWork.execute((tx) => PostgresJobsRepository.claimNext(type, tx));
  if (!result.isOk) throw result.error;
  return result.value;
};

describe("PostgresJobsRepository", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-alpine")
      .withDatabase("labeling_jobs_test")
      .withUsername("test")
      .withPassword("test")
      .start();
    Object.assign(config.database, {
      dialect: "postgresql",
      host: container.getHost(),
      name: container.getDatabase(),
      password: container.getPassword(),
      port: container.getMappedPort(5432),
      user: container.getUsername(),
    });

    const database = await createDatabase();
    if (database.dialect !== "postgresql") throw new Error("Expected PostgreSQL database");
    unitOfWork = database.uow;
    closeDatabase = database.close;
    await migrate(database.db, { migrationsFolder: resolve(import.meta.dir, "../../../migrations") });
  }, 120_000);

  beforeEach(async () => {
    const existing = await getJobs({});
    if (existing.length === 0) return;
    const result = await unitOfWork.execute((tx) =>
      PostgresJobsRepository.delete(
        existing.map(({ id }) => id),
        tx,
      ),
    );
    if (!result.isOk) throw result.error;
  });

  afterAll(async () => {
    await closeDatabase();
    await container?.stop();
  }, 30_000);

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
      PostgresJobsRepository.update([{ id: job.id, result, status: "completed" }], tx),
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
      PostgresJobsRepository.update([{ error: "vendor unavailable", id: job.id, status: "failed" }], tx),
    );
    if (!updated.isOk) throw updated.error;

    expect(updated.value).toMatchObject([{ error: "vendor unavailable", id: job.id, status: "failed" }]);
  });

  test("claims the next pending job of the requested type", async () => {
    await createJob({ type: "sync-labels" });
    const job = await createJob({ type: "sync-printers" });
    const claimed = await claimNext("sync-printers");

    expect(claimed).toMatchObject({ attempts: 1, id: job.id, status: "in_progress" });
    expect(claimed?.startedAt).toBeInstanceOf(Date);
    expect(claimed?.durationMs).toBeGreaterThanOrEqual(0);
    expect(await claimNext("sync-printers")).toBeNull();
    expect((await getJobs({ type: ["sync-labels"] }))[0]?.status).toBe("pending");
  });

  test("concurrent claims of one type start only one job", async () => {
    const jobs = await Promise.all([
      createJob({ type: "sync-printers" }),
      createJob({ type: "sync-printers" }),
      createJob({ type: "sync-printers" }),
      createJob({ type: "sync-printers" }),
    ]);
    await createJob({ type: "sync-labels" });
    const claimed = await Promise.all(jobs.map(() => claimNext("sync-printers")));
    const claimedJobs = claimed.filter((job): job is Job => job !== null);
    const claimedIds = claimedJobs.map(({ id }) => id);

    expect(claimedJobs).toHaveLength(1);
    expect(claimedIds[0]).toBeDefined();
    expect(claimedJobs[0]).toMatchObject({ attempts: 1, status: "in_progress" });
    expect(await getJobs({ status: ["in_progress"], type: ["sync-printers"] })).toHaveLength(1);
  });

  test("deletes only requested jobs", async () => {
    const target = await createJob();
    const retained = await createJob();
    const deleted = await unitOfWork.execute((tx) => PostgresJobsRepository.delete([target.id], tx));
    if (!deleted.isOk) throw deleted.error;

    expect(await getJobs({ id: [target.id] })).toEqual([]);
    expect(await getJobs({ id: [retained.id] })).toEqual([retained]);
  });

  test("rejects duplicate IDs in a batch update", async () => {
    const job = await createJob();
    const result = await unitOfWork.execute((tx) =>
      PostgresJobsRepository.update(
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
