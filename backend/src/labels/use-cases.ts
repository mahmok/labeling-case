import type { UnitOfWork } from "../db/unit-of-work.ts";
import { err, ok, type Result } from "../utils/result.ts";
import type { Label } from "./domain.ts";
import type { CreateLabelInput, GetLabelsInput, LabelsRepository, UpdateLabelInput } from "./repository/interface.ts";

export type Dependencies<T> = {
  uow: UnitOfWork<T>;
  repository: LabelsRepository<T>;
};

export type LabelUseCases = {
  createLabel: (input: CreateLabelInput) => Promise<Result<Label, Error>>;
  deleteLabel: (id: string) => Promise<Result<void, Error>>;
  getLabel: (id: string) => Promise<Result<Label, Error>>;
  getLabels: (input: GetLabelsInput) => Promise<Result<Label[], Error>>;
  updateLabel: (input: UpdateLabelInput) => Promise<Result<Label, Error>>;
};

export class LabelNotFoundError extends Error {
  constructor(id: string) {
    super(`Label ${id} was not found`);
    this.name = "LabelNotFoundError";
  }
}

export const getLabels =
  <T>({ repository, uow }: Dependencies<T>) =>
  (input: GetLabelsInput): Promise<Result<Label[], Error>> =>
    uow.execute((tx) => repository.get(input, tx));

export const getLabel =
  <T>({ repository, uow }: Dependencies<T>) =>
  async (id: string): Promise<Result<Label, Error>> =>
    uow.execute(async (tx) => {
      const result = await repository.get({ id: [id] }, tx);
      if (!result.isOk) return result;
      const [label] = result.value;
      return label ? ok(label) : err(new LabelNotFoundError(id));
    });

export const createLabel =
  <T>({ repository, uow }: Dependencies<T>) =>
  (input: CreateLabelInput): Promise<Result<Label, Error>> =>
    uow.execute(async (tx) => {
      const result = await repository.create([input], tx);
      if (!result.isOk) return result;
      const [label] = result.value;
      return label ? ok(label) : err(new Error("Label repository returned no created label"));
    });

export const updateLabel =
  <T>({ repository, uow }: Dependencies<T>) =>
  (input: UpdateLabelInput): Promise<Result<Label, Error>> =>
    uow.execute(async (tx) => {
      const result = await repository.update([input], tx);
      if (!result.isOk) return result;
      const [label] = result.value;
      return label ? ok(label) : err(new LabelNotFoundError(input.id));
    });

export const deleteLabel =
  <T>({ repository, uow }: Dependencies<T>) =>
  (id: string): Promise<Result<void, Error>> =>
    uow.execute(async (tx) => {
      const existing = await repository.get({ id: [id] }, tx);
      if (!existing.isOk) return existing;
      if (existing.value.length === 0) return err(new LabelNotFoundError(id));
      return repository.delete([id], tx);
    });

export const createLabelUseCases = <T>(deps: Dependencies<T>): LabelUseCases => ({
  createLabel: createLabel(deps),
  deleteLabel: deleteLabel(deps),
  getLabel: getLabel(deps),
  getLabels: getLabels(deps),
  updateLabel: updateLabel(deps),
});
