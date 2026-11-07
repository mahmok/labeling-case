import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { config } from "../../../src/config.ts";
import { createDatabase } from "../../../src/db";
import type { PostgresTransaction } from "../../../src/db/postgres/postgres.ts";
import type { UnitOfWork } from "../../../src/db/unit-of-work.ts";
import type { Label } from "../../../src/labels/domain.ts";
import type { CreateLabelInput, GetLabelsInput } from "../../../src/labels/repository/interface.ts";
import { PostgresLabelsRepository } from "../../../src/labels/repository/postgres.ts";

let container: StartedPostgreSqlContainer | undefined;
let unitOfWork: UnitOfWork<PostgresTransaction>;
let closeTestDatabase: () => Promise<void> = async () => {};

const createLabel = async (overrides: Partial<CreateLabelInput> = {}): Promise<Label> => {
  const marker = crypto.randomUUID();
  const input: CreateLabelInput = {
    id: `external-${marker}`,
    isPrimary: false,
    name: `label-${marker}`,
    version: `v-${marker}`,
    ...overrides,
  };
  const result = await unitOfWork.execute((tx) => PostgresLabelsRepository.create([input], tx));
  if (!result.isOk) throw result.error;

  const label = result.value[0];
  if (!label) throw new Error("Expected label creation to return a row");
  return label;
};

const getLabels = async (input: GetLabelsInput): Promise<Label[]> => {
  const result = await unitOfWork.execute((tx) => PostgresLabelsRepository.get(input, tx));
  if (!result.isOk) throw result.error;
  return result.value;
};

describe("PostgresLabelsRepository", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-alpine")
      .withDatabase("labeling_labels_test")
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
    closeTestDatabase = database.close;
    await migrate(database.db, { migrationsFolder: resolve(import.meta.dir, "../../../migrations") });
  }, 120_000);

  afterAll(async () => {
    await closeTestDatabase();
    await container?.stop();
  }, 30_000);

  test("creates labels with an externally supplied string ID and retrieves by ID", async () => {
    const id = crypto.randomUUID();
    const created = await createLabel({ id });
    const [retrieved] = await getLabels({ id: [created.id] });

    expect(created.id).toMatch(id);
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
    expect(retrieved).toEqual(created);
  });

  test("filters by partial name and exact version and primary status", async () => {
    const marker = crypto.randomUUID();
    const matching = await createLabel({
      isPrimary: true,
      name: `Front desk ${marker}`,
      version: `version-${marker}`,
    });
    await createLabel({ isPrimary: false, name: `Back desk ${marker}`, version: `other-${marker}` });

    const result = await getLabels({
      isPrimary: [true],
      name: [`front desk ${marker.slice(0, 8)}`],
      version: [matching.version],
    });

    expect(result.map(({ id }) => id)).toEqual([matching.id]);
  });

  test("filters by partial nickname", async () => {
    const marker = crypto.randomUUID();
    const matching = await createLabel({ nickname: `Packing station ${marker}` });
    await createLabel({ nickname: `Receiving station ${marker}` });

    const result = await getLabels({ nickname: ["packing"] });
    expect(result.map(({ id }) => id)).toEqual([matching.id]);
  });

  test("sorts and paginates only matching labels", async () => {
    const marker = crypto.randomUUID();
    const labels = await Promise.all(
      [`label-${marker}-c`, `label-${marker}-a`, `label-${marker}-b`].map((name) => createLabel({ name })),
    );

    const result = await getLabels({
      name: [marker],
      pagination: { limit: 1, offset: 1 },
      sorting: [{ direction: "ASC", key: "name" }],
    });

    expect(result.map(({ name }) => name)).toEqual([`label-${marker}-b`]);
    expect(labels).toHaveLength(3);
  });

  test("updates vendor and mutable fields for multiple labels", async () => {
    const first = await createLabel();
    const second = await createLabel();
    const marker = crypto.randomUUID();

    const updated = await unitOfWork.execute((tx) =>
      PostgresLabelsRepository.update(
        [
          { id: first.id, isPrimary: true, name: `updated-first-${marker}`, nickname: `nickname-first-${marker}` },
          { id: second.id, isPrimary: false, nickname: `nickname-second-${marker}`, version: `version-${marker}` },
        ],
        tx,
      ),
    );
    if (!updated.isOk) throw updated.error;

    const byId = new Map(updated.value.map((label) => [label.id, label]));
    expect(byId.get(first.id)).toMatchObject({
      isPrimary: true,
      name: `updated-first-${marker}`,
      nickname: `nickname-first-${marker}`,
    });
    expect(byId.get(second.id)).toMatchObject({
      isPrimary: false,
      nickname: `nickname-second-${marker}`,
      version: `version-${marker}`,
    });
  });

  test("clears a nickname, preserves createdAt, and advances updatedAt", async () => {
    const created = await createLabel({ isPrimary: true, nickname: "Existing nickname" });
    await Bun.sleep(10);
    const updated = await unitOfWork.execute((tx) =>
      PostgresLabelsRepository.update([{ id: created.id, nickname: null }], tx),
    );
    if (!updated.isOk) throw updated.error;

    const [label] = updated.value;
    expect(label).toMatchObject({ id: created.id, isPrimary: true, name: created.name, nickname: null });
    expect(label?.createdAt).toEqual(created.createdAt);
    expect(label?.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
  });

  test("deletes only requested labels", async () => {
    const target = await createLabel();
    const retained = await createLabel();
    const deleted = await unitOfWork.execute((tx) => PostgresLabelsRepository.delete([target.id], tx));
    if (!deleted.isOk) throw deleted.error;

    expect(await getLabels({ id: [target.id] })).toEqual([]);
    expect(await getLabels({ id: [retained.id] })).toEqual([retained]);
  });

  test("rejects duplicate IDs in a batch update without changing the label", async () => {
    const label = await createLabel();
    const result = await unitOfWork.execute((tx) =>
      PostgresLabelsRepository.update(
        [
          { id: label.id, nickname: "first" },
          { id: label.id, nickname: "duplicate" },
        ],
        tx,
      ),
    );
    const [unchanged] = await getLabels({ id: [label.id] });

    expect(result.isOk).toBe(false);
    expect(unchanged).toEqual(label);
  });
});
