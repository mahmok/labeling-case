import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

const backendDir = resolve(import.meta.dir, "../..");

type Job = { id: string; type: string; status: string; triggeredBy: string; result: unknown };
type Process = Bun.Subprocess<"ignore", "ignore", "pipe">;

let container: StartedPostgreSqlContainer | undefined;
let apiProcess: Process | undefined;
let workerProcess: Process | undefined;
let apiUrl: string;
let workerUrl: string;

const freePort = (): number => {
  const probe = Bun.serve({ fetch: () => new Response("ok"), port: 0 });
  const { port } = probe;
  void probe.stop(true);
  return port ?? 0;
};

const startProcess = (entry: string, env: Record<string, string>): Process =>
  Bun.spawn(["bun", "run", entry], {
    cwd: backendDir,
    env: { ...process.env, ...env },
    stderr: "pipe",
    stdout: "ignore",
  });

const waitFor = async <T>(description: string, check: () => Promise<T | undefined>, timeoutMs = 30_000): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value !== undefined) return value;
    } catch {
      // The process may still be starting; try again.
    }
    await Bun.sleep(250);
  }
  throw new Error(`Timed out waiting for ${description}`);
};

const getJobs = async (query = ""): Promise<Job[]> => {
  const response = await fetch(`${apiUrl}/api/v1/jobs${query}`);
  return ((await response.json()) as { data: Job[] }).data;
};

const exitedWithin = async (child: Process | undefined, timeoutMs: number): Promise<number | "timeout"> =>
  Promise.race([child?.exited ?? Promise.resolve(-1), Bun.sleep(timeoutMs).then(() => "timeout" as const)]);

describe("Running processes (end to end)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-alpine")
      .withDatabase("labeling_processes_e2e")
      .withUsername("test")
      .withPassword("test")
      .start();
    const apiPort = freePort();
    const workerPort = freePort();
    apiUrl = `http://localhost:${apiPort}`;
    workerUrl = `http://localhost:${workerPort}`;
    const env = {
      DATABASE_CONNECTION_TIMEOUT_MS: "2000",
      DATABASE_DIALECT: "postgresql",
      DATABASE_HOST: container.getHost(),
      DATABASE_NAME: container.getDatabase(),
      DATABASE_PASS: container.getPassword(),
      DATABASE_PORT: String(container.getMappedPort(5432)),
      DATABASE_USER: container.getUsername(),
      LOG_LEVEL: "error",
    };

    const migration = Bun.spawn(["bun", "run", "migrate.ts"], {
      cwd: backendDir,
      env: { ...process.env, ...env },
      stderr: "pipe",
      stdout: "ignore",
    });
    if ((await migration.exited) !== 0) throw new Error(await new Response(migration.stderr).text());

    apiProcess = startProcess("index.api.ts", { ...env, PORT: String(apiPort) });
    workerProcess = startProcess("index.worker.ts", { ...env, JOBS_WORKER_PORT: String(workerPort) });
    await waitFor("the API to be alive", async () => ((await fetch(`${apiUrl}/health/live`)).ok ? true : undefined));
    await waitFor("the worker to be alive", async () =>
      (await fetch(`${workerUrl}/health/live`)).ok ? true : undefined,
    );
  }, 120_000);

  afterAll(async () => {
    apiProcess?.kill();
    workerProcess?.kill();
    await container?.stop();
  }, 30_000);

  test("API and worker report live and ready while the database is up", async () => {
    for (const url of [apiUrl, workerUrl]) {
      expect(await (await fetch(`${url}/health/live`)).json()).toEqual({ status: "alive" });
      expect(await (await fetch(`${url}/health`)).json()).toEqual({ status: "running" });
    }
  });

  test("the worker runs its startup sync jobs and the API serves the synced data", async () => {
    const jobs = await waitFor("startup sync jobs to complete", async () => {
      const completed = await getJobs("?status=completed");
      const types = new Set(completed.map(({ type }) => type));
      return types.has("sync-printers") && types.has("sync-labels") ? completed : undefined;
    });

    expect(jobs.every(({ triggeredBy }) => triggeredBy === "system")).toBe(true);
    const printers = (await (await fetch(`${apiUrl}/api/v1/printers`)).json()) as { data: unknown[] };
    const labels = (await (await fetch(`${apiUrl}/api/v1/labels`)).json()) as { data: unknown[] };
    expect(printers.data.length).toBeGreaterThan(0);
    expect(labels.data.length).toBeGreaterThan(0);
  });

  test("a job queued through the API is picked up by the worker and completed", async () => {
    const queued = await fetch(`${apiUrl}/api/v1/jobs`, {
      body: JSON.stringify({ type: "backfill-prints" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const { data } = (await queued.json()) as { data: Job };
    expect(queued.status).toBe(202);
    expect(data).toMatchObject({ status: "pending", triggeredBy: "api" });

    const finished = await waitFor("the queued job to complete", async () => {
      const [job] = await getJobs("?type=backfill-prints&status=completed&sort=-createdAt");
      return job?.id === data.id ? job : undefined;
    });
    expect(finished.status).toBe("completed");
  });

  test("a print through the running API is recorded and listed", async () => {
    const response = await fetch(`${apiUrl}/api/v1/prints`, {
      body: JSON.stringify({ labelId: "lbl-001", printerName: "Office Printer" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const { data } = (await response.json()) as { data: { id: string; printer: { id: string | null } } };

    expect(response.status).toBe(201);
    expect(data.printer.id).not.toBeNull();
    const listed = (await (await fetch(`${apiUrl}/api/v1/prints`)).json()) as { data: { id: string }[] };
    expect(listed.data.map(({ id }) => id)).toContain(data.id);
  });

  test("with the database down, readiness fails, liveness holds and requests fail fast with JSON", async () => {
    await container?.stop();

    for (const url of [apiUrl, workerUrl]) {
      expect((await fetch(`${url}/health/live`)).status).toBe(200);
      const ready = await fetch(`${url}/health`);
      expect(ready.status).toBe(503);
      expect(await ready.json()).toMatchObject({ status: "unavailable" });
    }

    const startedAt = performance.now();
    const response = await fetch(`${apiUrl}/api/v1/printers`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { message: "Internal server error" } });
    expect(performance.now() - startedAt).toBeLessThan(8_000);
  }, 60_000);

  test("both processes shut down cleanly on SIGTERM", async () => {
    apiProcess?.kill("SIGTERM");
    workerProcess?.kill("SIGTERM");

    expect(await exitedWithin(apiProcess, 15_000)).toBe(0);
    expect(await exitedWithin(workerProcess, 15_000)).toBe(0);
  }, 40_000);
});
