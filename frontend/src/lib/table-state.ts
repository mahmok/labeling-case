import type { Atom } from "@tanstack/react-store";
import { useCreateAtom, useSelector } from "@tanstack/react-store";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { tableFeatures as createTableFeatures, rowPaginationFeature, rowSortingFeature } from "@tanstack/react-table";

export const tableFeatures = createTableFeatures({ rowPaginationFeature, rowSortingFeature });

const DEFAULT_PAGINATION: PaginationState = { pageIndex: 0, pageSize: 10 };
const EMPTY_SORTING: SortingState = [];

export type ServerTableState = {
  pagination: PaginationState;
  paginationAtom: Atom<PaginationState>;
  sorting: SortingState;
  sortingAtom: Atom<SortingState>;
};

export const useServerTableState = (initialSorting: SortingState = EMPTY_SORTING): ServerTableState => {
  const paginationAtom = useCreateAtom<PaginationState>(DEFAULT_PAGINATION);
  const sortingAtom = useCreateAtom<SortingState>(initialSorting);
  const pagination = useSelector(paginationAtom, (state) => state);
  const sorting = useSelector(sortingAtom, (state) => state);

  return { pagination, paginationAtom, sorting, sortingAtom };
};

export const sortingToQuery = <TKey extends string>(sorting: SortingState): Array<`+${TKey}` | `-${TKey}`> =>
  sorting.map(({ desc, id }) => `${desc ? "-" : "+"}${id}` as `+${TKey}` | `-${TKey}`);
