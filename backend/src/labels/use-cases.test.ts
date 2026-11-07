import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { config } from "../config.ts";
import { createDatabase } from "../db";
import type { SQLiteTransaction } from "../db/sqlite/unit-of-work.ts";
import type { UnitOfWork } from "../db/unit-of-work.ts";
import { isNotFoundError } from "../utils/errors.ts";
import { ok } from "../utils/result.ts";
import { MockClient } from "./client";
import type { LabelsClient } from "./client/interface.ts";
import type { Label } from "./domain.ts";
import { fromDialect } from "./repository";
import type { CreateLabelInput, LabelsRepository } from "./repository/interface.ts";
import { createLabelUseCases, type LabelUseCases } from "./use-cases.ts";

let useCases: LabelUseCases;
let repository: LabelsRepository<SQLiteTransaction>;
let unitOfWork: UnitOfWork<SQLiteTransaction>;
let closeDatabase: () => Promise<void> = async () => {};

const newLabelInput = (overrides: Partial<CreateLabelInput> = {}): CreateLabelInput => {
  const marker = crypto.randomUUID();
  return {
    id: `external-${marker}`,
    isPrimary: false,
    name: `label-${marker}`,
    version: `v-${marker}`,
    ...overrides,
  };
};

const createLabel = async (overrides: Partial<CreateLabelInput> = {}): Promise<Label> => {
  const result = await useCases.createLabel([newLabelInput(overrides)]);
  if (!result.isOk) throw result.error;
  const [label] = result.value;
  if (!label) throw new Error("Expected label creation to return a row");
  return label;
};

describe("Label use cases", () => {
  beforeEach(async () => {
    config.database.dialect = "sqlite";
    const database = await createDatabase();
    if (database.dialect !== "sqlite") throw new Error("Expected SQLite database");
    repository = await fromDialect("sqlite");
    unitOfWork = database.uow;
    useCases = createLabelUseCases({ client: MockClient, repository, uow: unitOfWork });
    closeDatabase = database.close;
  });

  afterEach(async () => {
    await closeDatabase();
  });

  test("createLabel persists a batch with externally supplied IDs", async () => {
    const first = newLabelInput({ id: `scanner-${crypto.randomUUID()}` });
    const second = newLabelInput({ id: `scanner-${crypto.randomUUID()}` });
    const result = await useCases.createLabel([first, second]);

    expect(result.isOk).toBe(true);
    if (result.isOk) expect(result.value.map(({ id }) => id)).toEqual([first.id, second.id]);
  });

  test("getVendorLabels returns results from the injected client", async () => {
    expect(await useCases.getVendorLabels()).toEqual(await MockClient.get({}));
  });

  test("getLabels returns repository matches", async () => {
    const marker = crypto.randomUUID();
    const label = await createLabel({ name: `shipping-${marker}` });
    await createLabel({ name: `receiving-${marker}` });

    const result = await useCases.getLabels({ name: [`shipping-${marker}`] });

    expect(result.isOk).toBe(true);
    if (result.isOk) expect(result.value.map(({ id }) => id)).toEqual([label.id]);
  });

  test("getLabel returns the requested label", async () => {
    const label = await createLabel();
    const result = await useCases.getLabel(label.id);

    expect(result).toEqual({ isOk: true, value: label });
  });

  test("getLabel returns a not-found error for an unknown ID", async () => {
    const result = await useCases.getLabel(`missing-${crypto.randomUUID()}`);

    expect(result.isOk).toBe(false);
    if (!result.isOk) expect(isNotFoundError(result.error)).toBe(true);
  });

  test("updateLabel updates vendor and mutable fields in a batch", async () => {
    const first = await createLabel();
    const second = await createLabel();
    const firstName = `first-${crypto.randomUUID()}`;
    const secondVersion = `version-${crypto.randomUUID()}`;
    const result = await useCases.updateLabel([
      { id: first.id, isPrimary: true, name: firstName },
      { id: second.id, nickname: "updated nickname", version: secondVersion },
    ]);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      const updatedById = new Map(result.value.map((label) => [label.id, label]));
      expect(updatedById.get(first.id)).toMatchObject({ isPrimary: true, name: firstName });
      expect(updatedById.get(second.id)).toMatchObject({ nickname: "updated nickname", version: secondVersion });
    }
  });

  test("updateLabel returns a not-found error if any ID is unknown", async () => {
    const label = await createLabel();
    const result = await useCases.updateLabel([
      { id: label.id, nickname: "should roll back" },
      { id: `missing-${crypto.randomUUID()}`, nickname: "unknown" },
    ]);

    expect(result.isOk).toBe(false);
    if (!result.isOk) expect(isNotFoundError(result.error)).toBe(true);
    expect(await useCases.getLabel(label.id)).toEqual({ isOk: true, value: label });
  });

  test("deleteLabel removes multiple labels and is safe to repeat", async () => {
    const first = await createLabel();
    const second = await createLabel();
    const retained = await createLabel();
    const ids = [first.id, second.id, first.id];

    expect(await useCases.deleteLabel(ids)).toEqual({ isOk: true, value: undefined });
    expect(await useCases.deleteLabel(ids)).toEqual({ isOk: true, value: undefined });
    expect(await useCases.getLabels({ id: [first.id, second.id] })).toEqual({ isOk: true, value: [] });
    expect(await useCases.getLabel(retained.id)).toEqual({ isOk: true, value: retained });
  });

  test("deleteLabel ignores unknown IDs in a batch", async () => {
    const label = await createLabel();
    const result = await useCases.deleteLabel([label.id, `missing-${crypto.randomUUID()}`]);

    expect(result).toEqual({ isOk: true, value: undefined });
    expect(await useCases.getLabels({ id: [label.id] })).toEqual({ isOk: true, value: [] });
  });

  test("applyLabelChanges creates, updates, and deletes in one operation", async () => {
    const toUpdate = await createLabel();
    const toDelete = await createLabel();
    const retained = await createLabel();
    const input = newLabelInput();
    const updatedName = `synced-${crypto.randomUUID()}`;
    const result = await useCases.applyLabelChanges({
      create: [input],
      delete: [toDelete.id],
      update: [{ id: toUpdate.id, name: updatedName, version: "2" }],
    });

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.created.map(({ id }) => id)).toEqual([input.id]);
      expect(result.value.updated).toMatchObject([{ id: toUpdate.id, name: updatedName, version: "2" }]);
      expect(result.value.deleted).toEqual([toDelete]);
    }
    expect(await useCases.getLabels({ id: [toDelete.id] })).toEqual({ isOk: true, value: [] });
    expect(await useCases.getLabel(retained.id)).toEqual({ isOk: true, value: retained });
  });

  test("applyLabelChanges rolls back the whole batch when an update ID is missing", async () => {
    const toDelete = await createLabel();
    const createdInput = newLabelInput();
    const result = await useCases.applyLabelChanges({
      create: [createdInput],
      delete: [toDelete.id],
      update: [{ id: `missing-${crypto.randomUUID()}`, name: "missing" }],
    });

    expect(result.isOk).toBe(false);
    if (!result.isOk) expect(isNotFoundError(result.error)).toBe(true);
    expect(await useCases.getLabel(toDelete.id)).toEqual({ isOk: true, value: toDelete });
    expect(await useCases.getLabels({ id: [createdInput.id] })).toEqual({ isOk: true, value: [] });
  });

  test("sync reconciles vendor labels by external ID", async () => {
    const unchanged = await createLabel({ id: "vendor-unchanged", name: "Unchanged", version: "1" });
    const toUpdate = await createLabel({ id: "vendor-update", name: "Old name", version: "1" });
    const toDelete = await createLabel({ id: "local-only", name: "Remove me", version: "1" });
    const client: LabelsClient = {
      get: async () =>
        ok([
          { id: "vendor-unchanged", name: "Unchanged", version: 1 },
          { id: "vendor-update", name: "New name", version: 2 },
          { id: "vendor-create", name: "Create me", version: 3 },
        ]),
    };
    const syncUseCases = createLabelUseCases({ client, repository, uow: unitOfWork });

    const result = await syncUseCases.sync();

    expect(result).toMatchObject({
      isOk: true,
      value: {
        created: [{ id: "vendor-create", name: "Create me", version: "3" }],
        deleted: [{ id: toDelete.id }],
        updated: [{ id: toUpdate.id, name: "New name", version: "2" }],
      },
    });
    expect(await syncUseCases.getLabel(unchanged.id)).toEqual({ isOk: true, value: unchanged });
    expect(await syncUseCases.getLabels({ id: [toDelete.id] })).toEqual({ isOk: true, value: [] });
  });

  test("sync leaves local labels unchanged for an empty vendor response", async () => {
    const label = await createLabel();
    const client: LabelsClient = { get: async () => ok([]) };
    const syncUseCases = createLabelUseCases({ client, repository, uow: unitOfWork });

    expect(await syncUseCases.sync()).toEqual({
      isOk: true,
      value: { created: [], deleted: [], updated: [] },
    });
    expect(await syncUseCases.getLabel(label.id)).toEqual({ isOk: true, value: label });
  });
});
