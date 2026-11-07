import type { UnitOfWork } from "../db/unit-of-work.ts";
import { notFoundError } from "../utils/errors.ts";
import { err, ok, type Result } from "../utils/result.ts";
import type { GetLabelsResponse, LabelsClient } from "./client/interface.ts";
import type { Label } from "./domain.ts";
import type { CreateLabelInput, GetLabelsInput, LabelsRepository, UpdateLabelInput } from "./repository/interface.ts";

export type Dependencies<T> = {
  client: LabelsClient;
  uow: UnitOfWork<T>;
  repository: LabelsRepository<T>;
};

export type ApplyLabelChangesInput = {
  create: CreateLabelInput[];
  update: UpdateLabelInput[];
  delete: string[];
};

export type ApplyLabelChangesResult = {
  created: Label[];
  updated: Label[];
  deleted: Label[];
};

export type LabelUseCases = {
  createLabel: (inputs: CreateLabelInput[]) => Promise<Result<Label[], Error>>;
  deleteLabel: (ids: string[]) => Promise<Result<void, Error>>;
  getLabel: (id: string) => Promise<Result<Label, Error>>;
  getLabels: (input: GetLabelsInput) => Promise<Result<Label[], Error>>;
  getVendorLabels: () => Promise<Result<GetLabelsResponse, Error>>;
  applyLabelChanges: (input: ApplyLabelChangesInput) => Promise<Result<ApplyLabelChangesResult, Error>>;
  updateLabel: (inputs: UpdateLabelInput[]) => Promise<Result<Label[], Error>>;
};

export const getVendorLabels = (client: LabelsClient) => (): Promise<Result<GetLabelsResponse, Error>> =>
  client.get({});

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
      return label ? ok(label) : err(notFoundError("Label", id));
    });

export const createLabel =
  <T>({ repository, uow }: Dependencies<T>) =>
  (inputs: CreateLabelInput[]): Promise<Result<Label[], Error>> =>
    uow.execute(async (tx) => {
      const result = await repository.create(inputs, tx);
      if (!result.isOk) return result;
      if (result.value.length !== inputs.length) {
        return err(new Error("Label repository returned an unexpected number of created labels"));
      }
      return result;
    });

export const updateLabel =
  <T>({ repository, uow }: Dependencies<T>) =>
  (inputs: UpdateLabelInput[]): Promise<Result<Label[], Error>> =>
    uow.execute(async (tx) => {
      const result = await repository.update(inputs, tx);
      if (!result.isOk) return result;
      const updatedIds = new Set(result.value.map(({ id }) => id));
      const missing = inputs.find(({ id }) => !updatedIds.has(id));
      return missing ? err(notFoundError("Label", missing.id)) : result;
    });

export const deleteLabel =
  <T>({ repository, uow }: Dependencies<T>) =>
  (ids: string[]): Promise<Result<void, Error>> =>
    uow.execute((tx) => repository.delete([...new Set(ids)], tx));

export const applyLabelChanges =
  <T>({ repository, uow }: Dependencies<T>) =>
  (input: ApplyLabelChangesInput): Promise<Result<ApplyLabelChangesResult, Error>> =>
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: It is not really complex, just a lot of steps to apply changes to labels.
    uow.execute(async (tx): Promise<Result<ApplyLabelChangesResult, Error>> => {
      const deleteIds = [...new Set(input.delete)];
      const toDelete = deleteIds.length > 0 ? await repository.get({ id: deleteIds }, tx) : ok<Label[]>([]);
      if (!toDelete.isOk) return toDelete;

      const deleted = await repository.delete(deleteIds, tx);
      if (!deleted.isOk) return deleted;

      const updated = await repository.update(input.update, tx);
      if (!updated.isOk) return updated;
      const updatedIds = new Set(updated.value.map(({ id }) => id));
      const missingUpdate = input.update.find(({ id }) => !updatedIds.has(id));
      if (missingUpdate) return err(notFoundError("Label", missingUpdate.id));

      const created = await repository.create(input.create, tx);
      if (!created.isOk) return created;
      if (created.value.length !== input.create.length) {
        return err(new Error("Label repository returned an unexpected number of created labels"));
      }

      return ok({ created: created.value, deleted: toDelete.value, updated: updated.value });
    });

export const createLabelUseCases = <T>(deps: Dependencies<T>): LabelUseCases => ({
  applyLabelChanges: applyLabelChanges(deps),
  createLabel: createLabel(deps),
  deleteLabel: deleteLabel(deps),
  getLabel: getLabel(deps),
  getLabels: getLabels(deps),
  getVendorLabels: getVendorLabels(deps.client),
  updateLabel: updateLabel(deps),
});
