import type { Atom } from "@tanstack/react-store";
import type { ColumnDef, Header, PaginationState, ReactTable, RowData, SortingState } from "@tanstack/react-table";
import { useTable } from "@tanstack/react-table";
import type { ChangeEvent, JSX, MouseEvent } from "react";
import { tableFeatures } from "../table-state.ts";

type GridHeaderProps<TData extends RowData> = {
  header: Header<typeof tableFeatures, TData>;
  direction: false | "asc" | "desc";
  onSort: (header: Header<typeof tableFeatures, TData>, event: MouseEvent<HTMLButtonElement>) => void;
  table: ReactTable<typeof tableFeatures, TData>;
};

const GridHeader = <TData extends RowData>({
  direction,
  header,
  onSort,
  table,
}: GridHeaderProps<TData>): JSX.Element => {
  const ariaSort = direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined;

  return (
    <th aria-sort={ariaSort} scope="col">
      {header.isPlaceholder ? null : header.column.getCanSort() ? (
        <button
          aria-label={`Sort by ${header.column.id}`}
          className="btn btn-ghost btn-sm -ml-3 gap-2 font-semibold"
          onClick={(event: MouseEvent<HTMLButtonElement>) => onSort(header, event)}
          type="button"
        >
          <table.FlexRender header={header} />
          <span aria-hidden="true">{direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕"}</span>
        </button>
      ) : (
        <table.FlexRender header={header} />
      )}
    </th>
  );
};

export type DataGridProps<TData extends RowData> = {
  caption: string;
  columns: ColumnDef<typeof tableFeatures, TData>[];
  data: TData[];
  error?: Error;
  hasNextPage: boolean;
  isFetching: boolean;
  isPending: boolean;
  onRowAction?: (row: TData) => void;
  paginationAtom: Atom<PaginationState>;
  rowActionLabel?: string;
  sortingAtom: Atom<SortingState>;
};

export const DataGrid = <TData extends RowData>({
  caption,
  columns,
  data,
  error,
  hasNextPage,
  isFetching,
  isPending,
  onRowAction,
  paginationAtom,
  rowActionLabel = "Edit",
  sortingAtom,
}: DataGridProps<TData>): JSX.Element => {
  const table = useTable({
    atoms: { pagination: paginationAtom, sorting: sortingAtom },
    columns,
    data,
    features: tableFeatures,
    manualPagination: true,
    manualSorting: true,
    pageCount: -1,
  });
  const columnCount = table.getAllLeafColumns().length + Number(Boolean(onRowAction));
  const pagination = table.state.pagination;
  const sorting = table.state.sorting;

  const handleSort = (header: Header<typeof tableFeatures, TData>, event: MouseEvent<HTMLButtonElement>): void => {
    header.column.getToggleSortingHandler()?.(event);
    table.setPageIndex(0);
  };

  return (
    <div className="space-y-4">
      {error ? (
        <div className="alert alert-error" role="alert">
          <span>{error.message}</span>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-box border border-base-300">
        <table className="table table-zebra">
          <caption className="sr-only">{caption}</caption>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sort = sorting.find((entry) => entry.id === header.column.id);
                  const direction = sort ? (sort.desc ? "desc" : "asc") : false;
                  return (
                    <GridHeader
                      direction={direction}
                      header={header}
                      key={header.id}
                      onSort={handleSort}
                      table={table}
                    />
                  );
                })}
                {onRowAction ? <th scope="col">Actions</th> : null}
              </tr>
            ))}
          </thead>
          <tbody>
            {isPending && data.length === 0 ? (
              <tr>
                <td className="py-10 text-center text-base-content/60" colSpan={columnCount}>
                  <span className="loading loading-spinner loading-sm mr-2" />
                  Loading {caption.toLowerCase()}…
                </td>
              </tr>
            ) : null}
            {!(isPending || error) && data.length === 0 ? (
              <tr>
                <td className="py-10 text-center text-base-content/60" colSpan={columnCount}>
                  No {caption.toLowerCase()} found.
                </td>
              </tr>
            ) : null}
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
                {onRowAction ? (
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => onRowAction(row.original)} type="button">
                      {rowActionLabel}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-base-content/70">
          Rows per page
          <select
            aria-label="Rows per page"
            className="select select-bordered select-sm"
            onChange={(event: ChangeEvent<HTMLSelectElement>) => table.setPageSize(Number(event.currentTarget.value))}
            value={pagination.pageSize}
          >
            {[10, 25, 50].map((pageSize) => (
              <option key={pageSize} value={pageSize}>
                {pageSize}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          <span className="text-sm text-base-content/70">Page {pagination.pageIndex + 1}</span>
          <div className="join">
            <button
              aria-label="Previous page"
              className="btn join-item btn-sm"
              disabled={!table.getCanPreviousPage() || isFetching}
              onClick={() => table.previousPage()}
              type="button"
            >
              Previous
            </button>
            <button
              aria-label="Next page"
              className="btn join-item btn-sm"
              disabled={!hasNextPage || isFetching}
              onClick={() => table.nextPage()}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
