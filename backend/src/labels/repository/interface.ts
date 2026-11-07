import type { Result } from "../../utils/result.ts";
import type { Label } from "../domain.ts";

export type CreateLabelInput = {
  id: string;
  name: string;
  version: string;
  nickname?: string;
  isPrimary: boolean;
};

export type UpdateLabelInput = {
  id: string;
  name?: string;
  version?: string;
  nickname?: string | null;
  isPrimary?: boolean;
};

export type GetLabelsInput = {
  id?: string[];
  name?: string[];
  version?: string[];
  nickname?: string[];
  isPrimary?: boolean[];
  pagination?: { limit: number; offset: number };
  sorting?: { key: keyof Label; direction: "ASC" | "DESC" }[];
};

export interface LabelsRepository<T> {
  create: (input: CreateLabelInput[], tx: T) => Promise<Result<Label[], Error>>;
  delete: (ids: string[], tx: T) => Promise<Result<void, Error>>;
  get: (input: GetLabelsInput, tx: T) => Promise<Result<Label[], Error>>;
  update: (input: UpdateLabelInput[], tx: T) => Promise<Result<Label[], Error>>;
}
