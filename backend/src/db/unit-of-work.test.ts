import { describe, expect, test } from "bun:test";
import { err, ok } from "../utils/result.ts";
import { createUnitOfWork, type UnitOfWork } from "./unit-of-work.ts";

type Transaction = { marker: string };

const createTestUnitOfWork = (): {
  state: { committed: boolean; rolledBack: boolean };
  unitOfWork: UnitOfWork<Transaction>;
} => {
  const state = { committed: false, rolledBack: false };
  const unitOfWork = createUnitOfWork<Transaction>(async (operation) => {
    try {
      const result = await operation({ marker: "test transaction" });
      state.committed = true;
      return result;
    } catch (error) {
      state.rolledBack = true;
      throw error;
    }
  });

  return { state, unitOfWork };
};

describe("UnitOfWork", () => {
  test("commits when the operation succeeds", async () => {
    const { state, unitOfWork } = createTestUnitOfWork();

    const result = await unitOfWork.execute(async (tx) => ok(tx.marker));

    expect(result).toEqual(ok("test transaction"));
    expect(state).toEqual({ committed: true, rolledBack: false });
  });

  test("rolls back and returns the repository error", async () => {
    const { state, unitOfWork } = createTestUnitOfWork();
    const failure = new Error("operation failed");

    const result = await unitOfWork.execute(async () => err(failure));

    expect(result).toEqual(err(failure));
    expect(state).toEqual({ committed: false, rolledBack: true });
  });

  test("rolls back and converts thrown errors to Result errors", async () => {
    const { state, unitOfWork } = createTestUnitOfWork();

    const result = await unitOfWork.execute(async () => {
      throw new Error("unexpected failure");
    });

    expect(result.isOk).toBe(false);
    if (!result.isOk) expect(result.error.message).toBe("unexpected failure");
    expect(state).toEqual({ committed: false, rolledBack: true });
  });
});
