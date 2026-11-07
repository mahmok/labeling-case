import type { CellContext, SortingState } from "@tanstack/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import type { JSX, SubmitEvent, SubmitEventHandler } from "react";
import { useMemo, useState } from "react";
import { DataGrid } from "../../lib/components/data-grid.tsx";
import { FormModal } from "../../lib/components/form-modal.tsx";
import { Page } from "../../lib/components/page.tsx";
import { sortingToQuery, type tableFeatures, useServerTableState } from "../../lib/table-state.ts";
import type { Label, LabelListParams, LabelSortKey } from "../api.tsx";
import { useLabels, useUpdateLabel } from "../api.tsx";

const EMPTY_LABELS: Label[] = [];
const INITIAL_SORTING: SortingState = [{ desc: false, id: "name" }];
const column = createColumnHelper<typeof tableFeatures, Label>();
const columns = column.columns([
  column.accessor("name", { header: "Name" }),
  column.accessor("version", { header: "Version" }),
  column.accessor("nickname", {
    cell: ({ getValue }: CellContext<typeof tableFeatures, Label, string | null>) => getValue() || "—",
    header: "Nickname",
  }),
  column.accessor("isPrimary", {
    cell: ({ getValue }: CellContext<typeof tableFeatures, Label, boolean>) => (
      <span className={`badge ${getValue() ? "badge-success" : "badge-ghost"}`}>
        {getValue() ? "Primary" : "Standard"}
      </span>
    ),
    header: "Primary",
  }),
]);

export const LabelsPage = (): JSX.Element => {
  const { pagination, paginationAtom, sorting, sortingAtom } = useServerTableState(INITIAL_SORTING);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const updateLabel = useUpdateLabel();
  const params = useMemo<LabelListParams>(
    () => ({
      limit: pagination.pageSize + 1,
      offset: pagination.pageIndex * pagination.pageSize,
      sort: sortingToQuery<LabelSortKey>(sorting),
    }),
    [pagination.pageIndex, pagination.pageSize, sorting],
  );
  const query = useLabels(params);
  const pageResult = query.data;
  const data = useMemo(
    () => (pageResult?.isOk ? pageResult.value.slice(0, pagination.pageSize) : EMPTY_LABELS),
    [pageResult, pagination.pageSize],
  );
  const error = pageResult && !pageResult.isOk ? pageResult.error : (query.error ?? undefined);

  const editLabel = (label: Label): void => {
    updateLabel.reset();
    setSubmitError(undefined);
    setSelectedLabel(label);
    setIsEditorOpen(true);
  };

  const saveLabel =
    (label: Label): SubmitEventHandler<HTMLFormElement> =>
    async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const updateResult = await updateLabel.mutateAsync({
        id: label.id,
        isPrimary: formData.get("isPrimary") === "on",
        nickname: String(formData.get("nickname") ?? "").trim() || null,
      });
      if (updateResult.isOk) {
        setIsEditorOpen(false);
        setSelectedLabel(null);
      } else {
        setSubmitError(updateResult.error.message);
      }
    };

  return (
    <Page description="Browse label definitions, versions, and primary label settings." label="Labels">
      <DataGrid
        caption="Labels"
        columns={columns}
        data={data}
        error={error}
        hasNextPage={Boolean(pageResult?.isOk && pageResult.value.length > pagination.pageSize)}
        isFetching={query.isFetching}
        isPending={query.isPending}
        onRowAction={editLabel}
        paginationAtom={paginationAtom}
        sortingAtom={sortingAtom}
      />

      {selectedLabel !== null ? (
        <FormModal
          error={submitError}
          isOpen={isEditorOpen}
          isSubmitting={updateLabel.isPending}
          onClose={() => setIsEditorOpen(false)}
          onSubmit={saveLabel(selectedLabel)}
          submitLabel="Save changes"
          title={`Edit ${selectedLabel.name}`}
        >
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Nickname</legend>
            <input
              className="input input-bordered w-full"
              defaultValue={selectedLabel.nickname ?? ""}
              name="nickname"
            />
          </fieldset>
          <label className="label cursor-pointer justify-start gap-3">
            <input className="checkbox" defaultChecked={selectedLabel.isPrimary} name="isPrimary" type="checkbox" />
            <span>Primary label</span>
          </label>
        </FormModal>
      ) : null}
    </Page>
  );
};
