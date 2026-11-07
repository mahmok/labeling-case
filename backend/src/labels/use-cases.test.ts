import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { config } from "../config.ts";
import { isNotFoundError } from "../utils/errors.ts";
import { createDatabase } from "../db";
import type { Label } from "./domain.ts";
import { fromDialect } from "./repository";
import type { CreateLabelInput } from "./repository/interface.ts";
import { createLabelUseCases, type LabelUseCases } from "./use-cases.ts";

let useCases: LabelUseCases;
let closeDatabase: () => Promise<void> = async () => {};

const createLabel = async (overrides: Partial<CreateLabelInput> = {}): Promise<Label> => {
  const marker = crypto.randomUUID();
  const result = await useCases.createLabel({
    id: `external-${marker}`,
    isPrimary: false,
    name: `label-${marker}`,
    version: `v-${marker}`,
    ...overrides,
  });
  if (!result.isOk) throw result.error;
  return result.value;
};

describe("Label use cases", () => {
  beforeAll(async () => {
    config.database.dialect = "sqlite";
    const database = await createDatabase();
    if (database.dialect !== "sqlite") throw new Error("Expected SQLite database");
    const repository = await fromDialect("sqlite");
    useCases = createLabelUseCases({ repository, uow: database.uow });
    closeDatabase = database.close;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("createLabel persists a label with the supplied external ID", async () => {
    const marker = crypto.randomUUID();
    const result = await useCases.createLabel({
      id: `scanner-${marker}`,
      isPrimary: true,
      name: `shipping-${marker}`,
      version: `v-${marker}`,
    });

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toMatchObject({
        id: `scanner-${marker}`,
        isPrimary: true,
        name: `shipping-${marker}`,
        version: `v-${marker}`,
      });
    }
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

  test("updateLabel persists mutable fields", async () => {
    const label = await createLabel();
    const nickname = `updated-${crypto.randomUUID()}`;
    const result = await useCases.updateLabel({ id: label.id, isPrimary: true, nickname });

    expect(result.isOk).toBe(true);
    if (result.isOk) expect(result.value).toMatchObject({ id: label.id, isPrimary: true, nickname });
  });

  test("updateLabel returns a not-found error for an unknown ID", async () => {
    const result = await useCases.updateLabel({ id: `missing-${crypto.randomUUID()}`, nickname: "unknown" });

    expect(result.isOk).toBe(false);
    if (!result.isOk) expect(isNotFoundError(result.error)).toBe(true);
  });

  test("deleteLabel removes the label", async () => {
    const label = await createLabel();
    const deleted = await useCases.deleteLabel(label.id);

    expect(deleted).toEqual({ isOk: true, value: undefined });
    expect(await useCases.getLabels({ id: [label.id] })).toEqual({ isOk: true, value: [] });
  });

  test("deleteLabel returns a not-found error for an unknown ID", async () => {
    const result = await useCases.deleteLabel(`missing-${crypto.randomUUID()}`);

    expect(result.isOk).toBe(false);
    if (!result.isOk) expect(isNotFoundError(result.error)).toBe(true);
  });
});
