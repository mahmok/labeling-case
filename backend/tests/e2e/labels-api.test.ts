import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createApi } from "../../src/api.ts";
import { type ApplicationUseCases, createApplication } from "../../src/application.ts";
import { config } from "../../src/config.ts";
import type { Label } from "../../src/labels/domain.ts";
import type { CreateLabelInput } from "../../src/labels/repository/interface.ts";

const labelsPath = "/api/v1/labels";
const jsonHeaders = { "content-type": "application/json" };

let container: StartedPostgreSqlContainer | undefined;
let server: Bun.Server<undefined> | undefined;
let closeDatabase: () => Promise<void> = async () => {};
let origin: string;
let useCases: ApplicationUseCases;

const request = (path: string, init?: RequestInit): Promise<Response> => fetch(`${origin}${path}`, init);

const labelResponse = (
  label: Label,
): Omit<Label, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string } => ({
  ...label,
  createdAt: label.createdAt.toISOString(),
  updatedAt: label.updatedAt.toISOString(),
});

const createLabel = async (overrides: Partial<CreateLabelInput> = {}): Promise<Label> => {
  const marker = crypto.randomUUID();
  const result = await useCases.labels.createLabel([
    {
      id: `external-${marker}`,
      isPrimary: false,
      name: `label-${marker}`,
      version: `v-${marker}`,
      ...overrides,
    },
  ]);
  if (!result.isOk) throw result.error;
  const label = result.value[0];
  if (!label) throw new Error("Expected label fixture to be created");
  return label;
};

describe("Labels API (end to end)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-alpine")
      .withDatabase("labeling_labels_e2e")
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

    const application = await createApplication();
    if (application.db.dialect !== "postgresql") throw new Error("Expected PostgreSQL database");
    closeDatabase = application.db.close;
    useCases = application.useCases;
    await migrate(application.db.db, { migrationsFolder: resolve(import.meta.dir, "../../migrations") });
    server = Bun.serve({ fetch: createApi(application.useCases).fetch, port: 0 });
    origin = `http://localhost:${server.port}`;
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
    await closeDatabase();
    await container?.stop();
  }, 30_000);

  test("does not expose a create endpoint", async () => {
    const response = await request(labelsPath, {
      body: JSON.stringify({ id: "label", isPrimary: false, name: "label", version: "v1" }),
      headers: jsonHeaders,
      method: "POST",
    });

    expect(response.status).toBe(404);
  });

  describe(`GET ${labelsPath}`, () => {
    test("filters by string ID, exact version, and primary status", async () => {
      const marker = crypto.randomUUID();
      const matching = await createLabel({
        id: `external/${marker}`,
        isPrimary: true,
        version: `version-${marker}`,
      });
      await createLabel({ isPrimary: false, version: `other-${marker}` });

      const query = new URLSearchParams({ id: matching.id, isPrimary: "true", version: matching.version });
      const response = await request(`${labelsPath}?${query}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: [{ id: matching.id, isPrimary: true, name: matching.name, version: matching.version }],
      });
    });

    test("filters by partial name and nickname, case-insensitively", async () => {
      const marker = crypto.randomUUID();
      const matching = await createLabel({
        name: `Front Office ${marker}`,
        nickname: `Packing station ${marker}`,
      });
      await createLabel({ name: `Back Office ${marker}`, nickname: `Receiving station ${marker}` });

      const response = await request(
        `${labelsPath}?${new URLSearchParams({ name: `front office ${marker.slice(0, 8)}`, nickname: "packing" })}`,
      );
      expect(await response.json()).toMatchObject({ data: [{ id: matching.id }] });
    });

    test("supports repeated filters, sorting, and pagination", async () => {
      const marker = crypto.randomUUID();
      const names = [`list-${marker}-c`, `list-${marker}-a`, `list-${marker}-b`];
      await Promise.all(names.map((name) => createLabel({ name, version: `list-version-${marker}` })));

      const query = new URLSearchParams();
      query.append("version", `list-version-${marker}`);
      query.append("isPrimary", "false");
      query.append("isPrimary", "true");
      query.set("name", marker);
      query.set("sort", "+name");
      query.set("limit", "1");
      query.set("offset", "1");
      const response = await request(`${labelsPath}?${query}`);
      const { data } = (await response.json()) as { data: Label[] };

      expect(response.status).toBe(200);
      expect(data.map(({ name }) => name)).toEqual([`list-${marker}-b`]);
    });

    test("rejects malformed filters and offset without a limit", async () => {
      expect((await request(`${labelsPath}?isPrimary=maybe`)).status).toBe(400);
      expect((await request(`${labelsPath}?offset=1`)).status).toBe(400);
      expect((await request(`${labelsPath}?sort=name`)).status).toBe(400);
    });
  });

  describe(`GET ${labelsPath}/:id`, () => {
    test("retrieves labels by externally supplied string ID", async () => {
      const label = await createLabel({ id: `external:${crypto.randomUUID()}` });
      const response = await request(`${labelsPath}/${encodeURIComponent(label.id)}`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: labelResponse(label) });
    });

    test("returns 404 for an unknown ID", async () => {
      expect((await request(`${labelsPath}/does-not-exist`)).status).toBe(404);
    });
  });

  describe(`PATCH ${labelsPath}/:id`, () => {
    test("updates mutable fields and allows clearing the nickname", async () => {
      const label = await createLabel({ nickname: "Existing nickname" });
      const updated = await request(`${labelsPath}/${label.id}`, {
        body: JSON.stringify({ isPrimary: true, nickname: "Updated nickname" }),
        headers: jsonHeaders,
        method: "PATCH",
      });
      expect(updated.status).toBe(200);
      expect(await updated.json()).toMatchObject({
        data: { id: label.id, isPrimary: true, name: label.name, nickname: "Updated nickname", version: label.version },
      });

      const cleared = await request(`${labelsPath}/${label.id}`, {
        body: JSON.stringify({ nickname: null }),
        headers: jsonHeaders,
        method: "PATCH",
      });
      expect(cleared.status).toBe(200);
      expect(await cleared.json()).toMatchObject({ data: { id: label.id, nickname: null } });
    });

    test("rejects updates to ID, name, or version and rejects empty payloads", async () => {
      const label = await createLabel();
      for (const field of ["id", "name", "version"]) {
        const response = await request(`${labelsPath}/${label.id}`, {
          body: JSON.stringify({ [field]: "replacement" }),
          headers: jsonHeaders,
          method: "PATCH",
        });
        expect(response.status).toBe(400);
      }

      const empty = await request(`${labelsPath}/${label.id}`, {
        body: JSON.stringify({}),
        headers: jsonHeaders,
        method: "PATCH",
      });
      expect(empty.status).toBe(400);
    });

    test("returns 404 when updating an unknown label", async () => {
      const response = await request(`${labelsPath}/missing`, {
        body: JSON.stringify({ nickname: "new" }),
        headers: jsonHeaders,
        method: "PATCH",
      });
      expect(response.status).toBe(404);
    });
  });

  describe(`DELETE ${labelsPath}/:id`, () => {
    test("deletes a label and makes it unavailable", async () => {
      const label = await createLabel();
      const deleted = await request(`${labelsPath}/${label.id}`, { method: "DELETE" });

      expect(deleted.status).toBe(204);
      expect((await request(`${labelsPath}/${label.id}`)).status).toBe(404);
    });

    test("returns success when deleting an unknown label", async () => {
      expect((await request(`${labelsPath}/missing`, { method: "DELETE" })).status).toBe(204);
      expect((await request(`${labelsPath}/missing`, { method: "DELETE" })).status).toBe(204);
    });
  });

  test("PATCH /api/v1/labels/lbl-001 without a JSON content type returns 415", async () => {
    const missing = await fetch(`${origin}/api/v1/labels/lbl-001`, { body: '{"nickname":"x"}', method: "PATCH" });
    const wrong = await fetch(`${origin}/api/v1/labels/lbl-001`, {
      body: '{"nickname":"x"}',
      headers: { "content-type": "text/plain" },
      method: "PATCH",
    });

    for (const response of [missing, wrong]) {
      expect(response.status).toBe(415);
      expect(await response.json()).toEqual({ error: { message: "Content-Type must be application/json" } });
    }
  });
});
