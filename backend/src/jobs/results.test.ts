import { describe, expect, test } from "bun:test";
import { syncJobResult } from "./results.ts";

type Item = { id: string; name: string; createdAt: Date };

const item = (id: string): Item => ({ createdAt: new Date("2026-01-02T03:04:05.000Z"), id, name: `Item ${id}` });

describe("syncJobResult", () => {
  test("returns the counts alongside the created, updated and deleted records", () => {
    const result = syncJobResult<Item>({ created: [item("a"), item("b")], deleted: [item("c")], updated: [] });

    expect(result).toEqual({
      counts: { created: 2, deleted: 1, updated: 0 },
      created: [
        { createdAt: "2026-01-02T03:04:05.000Z", id: "a", name: "Item a" },
        { createdAt: "2026-01-02T03:04:05.000Z", id: "b", name: "Item b" },
      ],
      deleted: [{ createdAt: "2026-01-02T03:04:05.000Z", id: "c", name: "Item c" }],
      updated: [],
    });
  });

  test("is plain JSON, so it can be stored as a job result", () => {
    const result = syncJobResult<Item>({ created: [item("a")], deleted: [], updated: [] });

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
