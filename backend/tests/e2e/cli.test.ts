import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createApplication } from "../../src/application.ts";
import { config } from "../../src/config.ts";

const TABLE_HEADER = /^\| id +\|/;
const backendDir = resolve(import.meta.dir, "../..");

type CliResult = { exitCode: number; stdout: string; stderr: string };

let container: StartedPostgreSqlContainer | undefined;
let closeDatabase: () => Promise<void> = async () => {};
let env: Record<string, string>;

const runCli = async (args: string[], extraEnv: Record<string, string> = {}): Promise<CliResult> => {
  const child = Bun.spawn(["bun", "run", "index.cli.ts", ...args], {
    cwd: backendDir,
    env: { ...process.env, ...env, ...extraEnv },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stderr, stdout };
};

const runJson = async <T>(args: string[]): Promise<T> => {
  const result = await runCli([...args, "--format", "json"]);
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout) as T;
};

describe("CLI (end to end)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-alpine")
      .withDatabase("labeling_cli_e2e")
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
    env = {
      DATABASE_DIALECT: "postgresql",
      DATABASE_HOST: container.getHost(),
      DATABASE_NAME: container.getDatabase(),
      DATABASE_PASS: container.getPassword(),
      DATABASE_PORT: String(container.getMappedPort(5432)),
      DATABASE_USER: container.getUsername(),
    };

    const application = await createApplication();
    if (application.db.dialect !== "postgresql") throw new Error("Expected PostgreSQL database");
    closeDatabase = application.db.close;
    await migrate(application.db.db, { migrationsFolder: resolve(import.meta.dir, "../../migrations") });
    const [printers, labels] = await Promise.all([
      application.useCases.printers.sync(),
      application.useCases.labels.sync(),
    ]);
    if (!(printers.isOk && labels.isOk)) throw new Error("Could not seed the database");
  }, 120_000);

  afterAll(async () => {
    await closeDatabase();
    await container?.stop();
  }, 30_000);

  test("lists and filters printers as JSON, and shows one printer by ID", async () => {
    const all = await runJson<{ id: string; name: string }[]>(["printers", "list"]);
    expect(all.length).toBeGreaterThan(1);

    const filtered = await runJson<{ id: string; name: string }[]>(["printers", "list", "--name", "Office Printer"]);
    expect(filtered).toHaveLength(1);
    const [office] = filtered;

    const one = await runJson<{ id: string; name: string }>(["printers", "get", office?.id ?? ""]);
    expect(one).toMatchObject({ id: office?.id, name: "Office Printer" });
  });

  test("pages and sorts labels", async () => {
    const page = await runJson<{ name: string }[]>([
      "labels",
      "list",
      "--sort",
      "name:desc",
      "--limit",
      "2",
      "--offset",
      "1",
    ]);
    const sorted = await runJson<{ name: string }[]>(["labels", "list", "--sort", "name:desc"]);

    expect(page.map(({ name }) => name)).toEqual(sorted.slice(1, 3).map(({ name }) => name));
  });

  test("prints a table when asked for one", async () => {
    const result = await runCli(["printers", "list", "--limit", "2", "--format", "md"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(TABLE_HEADER);
  });

  test("prints a label, then lists and gets the print", async () => {
    const created = await runJson<{ id: string; triggeredBy: string; printer: { name: string; id: string | null } }>([
      "prints",
      "create",
      "--label",
      "lbl-001",
      "--printer",
      "Office Printer",
    ]);
    expect(created).toMatchObject({ printer: { name: "Office Printer" }, triggeredBy: "cli" });
    expect(created.printer.id).not.toBeNull();

    const listed = await runJson<{ id: string }[]>(["prints", "list", "--triggered-by", "cli"]);
    expect(listed.map(({ id }) => id)).toContain(created.id);
    expect(await runJson<{ id: string }>(["prints", "get", created.id])).toMatchObject({ id: created.id });
  });

  test("rejects printing on a printer nobody knows, with a non-zero exit code and the error on stderr", async () => {
    const result = await runCli(["prints", "create", "--label", "lbl-001", "--printer", "Not A Real Printer"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Printer Not A Real Printer was not found");
  });

  test("queues a job as the cli and shows it", async () => {
    const queued = await runJson<{ id: string; status: string; triggeredBy: string; type: string }>([
      "jobs",
      "create",
      "sync-labels",
    ]);
    expect(queued).toMatchObject({ status: "pending", triggeredBy: "cli", type: "sync-labels" });

    const listed = await runJson<{ id: string }[]>(["jobs", "list", "--type", "sync-labels", "--status", "pending"]);
    expect(listed.map(({ id }) => id)).toContain(queued.id);
    expect(await runJson<{ id: string }>(["jobs", "get", queued.id])).toMatchObject({ id: queued.id });
  });

  test("reports bad input without touching the database", async () => {
    const badId = await runCli(["printers", "get", "not-a-uuid"]);
    const badType = await runCli(["jobs", "create", "bogus"]);
    const badOffset = await runCli(["jobs", "list", "--offset", "2"]);

    for (const result of [badId, badType, badOffset]) {
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
    }
    expect(badId.stderr).toContain("Invalid <id>");
    expect(badType.stderr).toContain("Invalid <type>");
    expect(badOffset.stderr).toContain("--limit is required when --offset is provided");
  });

  test("refuses to run against SQLite", async () => {
    const result = await runCli(["printers", "list"], { DATABASE_DIALECT: "sqlite" });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("PostgreSQL");
  });
});
