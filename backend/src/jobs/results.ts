import type { JobResult, JsonValue } from "./domain.ts";

export type SyncChanges<T> = {
  created: T[];
  updated: T[];
  deleted: T[];
};

const toJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));

export const syncJobResult = <T>(changes: SyncChanges<T>): JobResult => ({
  counts: {
    created: changes.created.length,
    deleted: changes.deleted.length,
    updated: changes.updated.length,
  },
  created: toJson(changes.created),
  deleted: toJson(changes.deleted),
  updated: toJson(changes.updated),
});
