import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { config } from "../../../src/config.ts";
import { createDatabase } from "../../../src/db";
import type { SQLiteTransaction } from "../../../src/db/sqlite/unit-of-work.ts";
import type { UnitOfWork } from "../../../src/db/unit-of-work.ts";
import type { Label } from "../../../src/labels/domain.ts";
import type { CreateLabelInput, GetLabelsInput, UpdateLabelInput } from "../../../src/labels/repository/interface.ts";
import { SQLiteLabelsRepository } from "../../../src/labels/repository/sqlite.ts";

let unitOfWork: UnitOfWork<SQLiteTransaction>;
let closeDatabase: () => Promise<void> = async () => {};

const createLabel = async (overrides: Partial<CreateLabelInput> = {}): Promise<Label> => {
  const marker = crypto.randomUUID();
  const input: CreateLabelInput = {
    id: `external-${marker}`,
    isPrimary: false,
    name: `label-${marker}`,
    version: `v-${marker}`,
    ...overrides,
  };
  const result = await unitOfWork.execute((tx) => SQLiteLabelsRepository.create([input], tx));
  if (!result.isOk) throw result.error;
  const label = result.value[0];
  if (!label) throw new Error("Expected label creation to return a row");
  return label;
};

const getLabels = async (input: GetLabelsInput): Promise<Label[]> => {
  const result = await unitOfWork.execute((tx) => SQLiteLabelsRepository.get(input, tx));
  if (!result.isOk) throw result.error;
  return result.value;
};

const updateLabels = async (input: UpdateLabelInput[]): Promise<Label[]> => {
  const result = await unitOfWork.execute((tx) => SQLiteLabelsRepository.update(input, tx));
  if (!result.isOk) throw result.error;
  return result.value;
};

describe("SQLiteLabelsRepository", () => {
  beforeAll(async () => {
    config.database.dialect = "sqlite";
    const database = await createDatabase();
    if (database.dialect !== "sqlite") throw new Error("Expected SQLite database");
    unitOfWork = database.uow;
    closeDatabase = database.close;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("creates labels with an externally supplied string ID and timestamps", async () => {
    const label = await createLabel({ id: `scanner:${crypto.randomUUID()}` });

    expect(label.id.startsWith("scanner:")).toBe(true);
    expect(label.createdAt).toBeInstanceOf(Date);
    expect(label.updatedAt).toBeInstanceOf(Date);
  });

  test("retrieves a label by its external ID", async () => {
    const created = await createLabel({ id: `external-id/${crypto.randomUUID()}` });

    expect(await getLabels({ id: [created.id] })).toEqual([created]);
  });

  test("filters by partial name and exact version and primary status", async () => {
    const marker = crypto.randomUUID();
    const matching = await createLabel({
      isPrimary: true,
      name: `Shipping desk ${marker}`,
      version: `version-${marker}`,
    });
    await createLabel({ isPrimary: false, name: `Returns desk ${marker}`, version: `other-${marker}` });

    const result = await getLabels({
      isPrimary: [true],
      name: [`shipping desk ${marker.slice(0, 8)}`],
      version: [matching.version],
    });

    expect(result.map(({ id }) => id)).toEqual([matching.id]);
  });

  test("filters by partial nickname", async () => {
    const matching = await createLabel({ nickname: `Packing station ${crypto.randomUUID()}` });
    await createLabel({ nickname: `Receiving station ${crypto.randomUUID()}` });

    expect((await getLabels({ nickname: ["packing"] })).map(({ id }) => id)).toEqual([matching.id]);
  });

  test("sorts and paginates matching labels", async () => {
    const marker = crypto.randomUUID();
    for (const name of [`label-${marker}-c`, `label-${marker}-a`, `label-${marker}-b`]) {
      await createLabel({ name });
    }

    const result = await getLabels({
      name: [marker],
      pagination: { limit: 1, offset: 1 },
      sorting: [{ direction: "ASC", key: "name" }],
    });

    expect(result.map(({ name }) => name)).toEqual([`label-${marker}-b`]);
  });

  test("updates nickname and primary status", async () => {
    const label = await createLabel();
    const nickname = `Updated ${crypto.randomUUID()}`;
    const updated = await updateLabels([{ id: label.id, isPrimary: true, nickname }]);

    expect(updated).toMatchObject([{ id: label.id, isPrimary: true, nickname }]);
  });

  test("clears a label nickname", async () => {
    const label = await createLabel({ nickname: "Existing nickname" });

    expect(await updateLabels([{ id: label.id, nickname: null }])).toMatchObject([{ id: label.id, nickname: null }]);
  });

  test("rejects duplicate IDs in a batch update without changing the label", async () => {
    const label = await createLabel();
    const result = await unitOfWork.execute((tx) =>
      SQLiteLabelsRepository.update(
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

  test("deletes only the requested label", async () => {
    const target = await createLabel();
    const retained = await createLabel();
    const result = await unitOfWork.execute((tx) => SQLiteLabelsRepository.delete([target.id], tx));

    expect(result.isOk).toBe(true);
    expect(await getLabels({ id: [target.id] })).toEqual([]);
    expect(await getLabels({ id: [retained.id] })).toEqual([retained]);
  });
});
