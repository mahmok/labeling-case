import type { CellContext, SortingState } from "@tanstack/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { DataGrid } from "../../lib/components/data-grid.tsx";
import { Page } from "../../lib/components/page.tsx";
import { sortingToQuery, type tableFeatures, useServerTableState } from "../../lib/table-state.ts";
import type { Print, PrintListParams, PrintSortKey } from "../api.tsx";
import { usePrints } from "../api.tsx";
import { PrintDialog } from "../components/print-dialog.tsx";

const EMPTY_PRINTS: Print[] = [];
const INITIAL_SORTING: SortingState = [{ desc: true, id: "createdAt" }];
const column = createColumnHelper<typeof tableFeatures, Print>();
const columns = column.columns([
  column.accessor((print) => print.label.name ?? "Unknown label", { header: "Label", id: "labelName" }),
  column.accessor("label.version", {
    cell: ({ getValue }: CellContext<typeof tableFeatures, Print, string | null>) => getValue() ?? "—",
    header: "Version",
  }),
  column.accessor("printer.name", { header: "Printer", id: "printerName" }),
  column.accessor("triggeredBy", { header: "Triggered by" }),
  column.accessor("createdAt", {
    cell: ({ getValue }: CellContext<typeof tableFeatures, Print, string>) => new Date(getValue()).toLocaleString(),
    header: "Printed at",
  }),
]);

export const PrintsPage = (): JSX.Element => {
  const { pagination, paginationAtom, sorting, sortingAtom } = useServerTableState(INITIAL_SORTING);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const params = useMemo<PrintListParams>(
    () => ({
      limit: pagination.pageSize + 1,
      offset: pagination.pageIndex * pagination.pageSize,
      sort: sortingToQuery<PrintSortKey>(sorting),
    }),
    [pagination.pageIndex, pagination.pageSize, sorting],
  );
  const query = usePrints(params);
  const pageResult = query.data;
  const data = useMemo(
    () => (pageResult?.isOk ? pageResult.value.slice(0, pagination.pageSize) : EMPTY_PRINTS),
    [pageResult, pagination.pageSize],
  );
  const error = pageResult && !pageResult.isOk ? pageResult.error : (query.error ?? undefined);

  return (
    <Page description="Review print activity and its associated labels and printers." label="Prints">
      <div className="flex justify-end">
        <button className="btn" onClick={() => setIsDialogOpen(true)} type="button">
          Print a label
        </button>
      </div>
      <DataGrid
        caption="Prints"
        columns={columns}
        data={data}
        error={error}
        hasNextPage={Boolean(pageResult?.isOk && pageResult.value.length > pagination.pageSize)}
        isFetching={query.isFetching}
        isPending={query.isPending}
        paginationAtom={paginationAtom}
        sortingAtom={sortingAtom}
      />
      <PrintDialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} />
    </Page>
  );
};
