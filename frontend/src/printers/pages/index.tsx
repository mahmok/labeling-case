import type { CellContext, SortingState } from "@tanstack/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import type { JSX, SubmitEvent, SubmitEventHandler } from "react";
import { useMemo, useState } from "react";
import { DataGrid } from "../../lib/components/data-grid.tsx";
import { FormModal } from "../../lib/components/form-modal.tsx";
import { Page } from "../../lib/components/page.tsx";
import { sortingToQuery, type tableFeatures, useServerTableState } from "../../lib/table-state.ts";
import type { Printer, PrinterListParams, PrinterSortKey } from "../api.tsx";
import { usePrinters, useUpdatePrinter } from "../api.tsx";

const EMPTY_PRINTERS: Printer[] = [];
const INITIAL_SORTING: SortingState = [{ desc: false, id: "name" }];
const column = createColumnHelper<typeof tableFeatures, Printer>();
const columns = column.columns([
  column.accessor("name", { header: "Name" }),
  column.accessor("model", { header: "Model" }),
  column.accessor("nickname", {
    cell: ({ getValue }: CellContext<typeof tableFeatures, Printer, string | null>) => getValue() || "—",
    header: "Nickname",
  }),
  column.accessor("location", { header: "Location" }),
  column.accessor("serialNumber", { header: "Serial number" }),
]);

export const PrintersPage = (): JSX.Element => {
  const { pagination, paginationAtom, sorting, sortingAtom } = useServerTableState(INITIAL_SORTING);
  const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const updatePrinter = useUpdatePrinter();
  const params = useMemo<PrinterListParams>(
    () => ({
      limit: pagination.pageSize + 1,
      offset: pagination.pageIndex * pagination.pageSize,
      sort: sortingToQuery<PrinterSortKey>(sorting),
    }),
    [pagination.pageIndex, pagination.pageSize, sorting],
  );
  const query = usePrinters(params);
  const pageResult = query.data;
  const data = useMemo(
    () => (pageResult?.isOk ? pageResult.value.slice(0, pagination.pageSize) : EMPTY_PRINTERS),
    [pageResult, pagination.pageSize],
  );
  const error = pageResult && !pageResult.isOk ? pageResult.error : (query.error ?? undefined);

  const editPrinter = (printer: Printer): void => {
    updatePrinter.reset();
    setSubmitError(undefined);
    setSelectedPrinter(printer);
    setIsEditorOpen(true);
  };

  const savePrinter =
    (printer: Printer): SubmitEventHandler<HTMLFormElement> =>
    async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const updateResult = await updatePrinter.mutateAsync({
        id: printer.id,
        location: String(formData.get("location") ?? ""),
        nickname: String(formData.get("nickname") ?? "").trim() || null,
        serialNumber: String(formData.get("serialNumber") ?? ""),
      });
      if (updateResult.isOk) {
        setIsEditorOpen(false);
        setSelectedPrinter(null);
      } else {
        setSubmitError(updateResult.error.message);
      }
    };

  return (
    <Page description="Review connected printers, locations, and device details." label="Printers">
      <DataGrid
        caption="Printers"
        columns={columns}
        data={data}
        error={error}
        hasNextPage={Boolean(pageResult?.isOk && pageResult.value.length > pagination.pageSize)}
        isFetching={query.isFetching}
        isPending={query.isPending}
        onRowAction={editPrinter}
        paginationAtom={paginationAtom}
        sortingAtom={sortingAtom}
      />

      {selectedPrinter !== null ? (
        <FormModal
          error={submitError}
          isOpen={isEditorOpen}
          isSubmitting={updatePrinter.isPending}
          onClose={() => setIsEditorOpen(false)}
          onSubmit={savePrinter(selectedPrinter)}
          submitLabel="Save changes"
          title={`Edit ${selectedPrinter.name}`}
        >
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Nickname</legend>
            <input
              className="input input-bordered w-full"
              defaultValue={selectedPrinter.nickname ?? ""}
              name="nickname"
            />
          </fieldset>
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Location</legend>
            <input
              className="input input-bordered w-full"
              defaultValue={selectedPrinter.location}
              name="location"
              required
            />
          </fieldset>
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Serial number</legend>
            <input
              className="input input-bordered w-full"
              defaultValue={selectedPrinter.serialNumber}
              name="serialNumber"
              required
            />
          </fieldset>
        </FormModal>
      ) : null}
    </Page>
  );
};
