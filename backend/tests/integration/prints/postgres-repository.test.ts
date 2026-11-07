import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { config } from "../../../src/config.ts";
import { createDatabase } from "../../../src/db";
import type { PostgresTransaction } from "../../../src/db/postgres/postgres.ts";
import type { UnitOfWork } from "../../../src/db/unit-of-work.ts";
import { PostgresLabelsRepository } from "../../../src/labels/repository/postgres.ts";
import type { Print } from "../../../src/prints";
import type { CreatePrintInput, GetPrintsInput } from "../../../src/prints/repository/interface.ts";
import { PostgresPrintsRepository } from "../../../src/prints/repository/postgres.ts";

let container: StartedPostgreSqlContainer | undefined;
let unitOfWork: UnitOfWork<PostgresTransaction>;
let closeDatabase: () => Promise<void> = async () => {};

const createPrint = async (overrides: Partial<CreatePrintInput> = {}): Promise<Print> => {
  const marker = crypto.randomUUID();
  const input: CreatePrintInput = {
    label: { id: `label-${marker}` },
    printer: { id: null, name: `printer-${marker}` },
    triggeredBy: `user-${marker}`,
    ...overrides,
  };
  const result = await unitOfWork.execute((tx) => PostgresPrintsRepository.create([input], tx));
  if (!result.isOk) throw result.error;
  const print = result.value[0];
  if (!print) throw new Error("Expected print creation to return a row");
  return print;
};

const createLabel = async (id: string, name: string, version: string): Promise<void> => {
  const result = await unitOfWork.execute((tx) =>
    PostgresLabelsRepository.create([{ id, isPrimary: false, name, version }], tx),
  );
  if (!result.isOk) throw result.error;
};

const getPrints = async (input: GetPrintsInput): Promise<Print[]> => {
  const result = await unitOfWork.execute((tx) => PostgresPrintsRepository.get(input, tx));
  if (!result.isOk) throw result.error;
  return result.value;
};

describe("PostgresPrintsRepository", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-alpine")
      .withDatabase("labeling_prints_test")
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

  afterAll(async () => {
    await closeDatabase();
    await container?.stop();
  });

  test("persists the provided printer ID and vendor name without lookup", async () => {
    const marker = crypto.randomUUID();
    const labelId = `label-${marker}`;
    await createLabel(labelId, `Shipping ${marker}`, "v1");
    const printer = { id: crypto.randomUUID(), name: `Shipping printer ${marker}` };
    const input: CreatePrintInput = {
      label: { id: labelId },
      printer,
      triggeredBy: `api-${marker}`,
    };

    const print = await createPrint(input);

    expect(print).toMatchObject({ ...input, label: { id: labelId, name: `Shipping ${marker}`, version: "v1" } });
    expect(print.createdAt).toBeInstanceOf(Date);
    expect(print.updatedAt).toBeInstanceOf(Date);
    expect(await getPrints({ id: [print.id] })).toEqual([print]);
  });

  test("persists a null printer ID without resolving it from the cache", async () => {
    const printerName = `Cached printer ${crypto.randomUUID()}`;
    const print = await createPrint({ printer: { id: null, name: printerName } });

    expect(print.printer).toEqual({ id: null, name: printerName });
    expect(await getPrints({ id: [print.id] })).toEqual([print]);
  });

  test("backfills null printer IDs in a batch", async () => {
    const first = await createPrint();
    const second = await createPrint();
    const firstPrinterId = crypto.randomUUID();
    const secondPrinterId = crypto.randomUUID();

    const result = await unitOfWork.execute((tx) =>
      PostgresPrintsRepository.updatePrinterIds(
        [
          { id: first.id, printerId: firstPrinterId },
          { id: second.id, printerId: secondPrinterId },
        ],
        tx,
      ),
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(new Map(result.value.map(({ id, printer }) => [id, printer.id]))).toEqual(
        new Map([
          [first.id, firstPrinterId],
          [second.id, secondPrinterId],
        ]),
      );
    }
    expect(await getPrints({ id: [first.id, second.id], printerIdIsNull: true })).toEqual([]);
  });

  test("sorts, paginates, and deletes print records", async () => {
    const marker = crypto.randomUUID();
    const first = await createPrint({ triggeredBy: marker });
    const second = await createPrint({ triggeredBy: marker });

    expect(
      await getPrints({
        pagination: { limit: 1, offset: 0 },
        sorting: [{ direction: "ASC", key: "id" }],
        triggeredBy: [marker],
      }),
    ).toHaveLength(1);

    const deleted = await unitOfWork.execute((tx) => PostgresPrintsRepository.delete([first.id], tx));
    expect(deleted).toEqual({ isOk: true, value: undefined });
    expect(await getPrints({ id: [first.id, second.id] })).toEqual([second]);
  });
});
