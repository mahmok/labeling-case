import type { CellContext, SortingState } from "@tanstack/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import type { JSX, SubmitEvent } from "react";
import { useMemo, useState } from "react";
import { DataGrid } from "../../lib/components/data-grid.tsx";
import { FormModal } from "../../lib/components/form-modal.tsx";
import { Page } from "../../lib/components/page.tsx";
import { sortingToQuery, type tableFeatures, useServerTableState } from "../../lib/table-state.ts";
import type { Job, JobListParams, JobSortKey, JobStatus } from "../api.tsx";
import { useCreateJob, useJobs } from "../api.tsx";

const EMPTY_JOBS: Job[] = [];
const INITIAL_SORTING: SortingState = [{ desc: true, id: "createdAt" }];
const column = createColumnHelper<typeof tableFeatures, Job>();
const statusClass: Record<JobStatus, string> = {
  completed: "badge-success",
  failed: "badge-error",
  in_progress: "badge-info",
  pending: "badge-warning",
};
const columns = column.columns([
  column.accessor("type", { header: "Type" }),
  column.accessor("status", {
    cell: ({ getValue }: CellContext<typeof tableFeatures, Job, JobStatus>) => (
      <span className={`badge ${statusClass[getValue()]}`}>{getValue().replaceAll("_", " ")}</span>
    ),
    header: "Status",
  }),
  column.accessor("attempts", { header: "Attempts" }),
  column.accessor("durationMs", {
    cell: ({ getValue }: CellContext<typeof tableFeatures, Job, number | null>) =>
      getValue() === null ? "—" : `${getValue()} ms`,
    header: "Duration",
  }),
  column.accessor("triggeredBy", { header: "Triggered by" }),
  column.accessor("createdAt", {
    cell: ({ getValue }: CellContext<typeof tableFeatures, Job, string>) => new Date(getValue()).toLocaleString(),
    header: "Created at",
  }),
]);

export const JobsPage = (): JSX.Element => {
  const { pagination, paginationAtom, sorting, sortingAtom } = useServerTableState(INITIAL_SORTING);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const createJobMutation = useCreateJob();
  const params = useMemo<JobListParams>(
    () => ({
      limit: pagination.pageSize + 1,
      offset: pagination.pageIndex * pagination.pageSize,
      sort: sortingToQuery<JobSortKey>(sorting),
    }),
    [pagination.pageIndex, pagination.pageSize, sorting],
  );
  const query = useJobs(params);
  const pageResult = query.data;
  const data = useMemo(
    () => (pageResult?.isOk ? pageResult.value.slice(0, pagination.pageSize) : EMPTY_JOBS),
    [pageResult, pagination.pageSize],
  );
  const error = pageResult && !pageResult.isOk ? pageResult.error : (query.error ?? undefined);

  const submitJob = async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const type = formData.get("type");
    if (type !== "sync-printers" && type !== "sync-labels") return;
    const createdJob = await createJobMutation.mutateAsync({ type });
    if (createdJob.isOk) {
      setIsDialogOpen(false);
      setSubmitError(undefined);
    } else {
      setSubmitError(createdJob.error.message);
    }
  };

  const openDialog = (): void => {
    createJobMutation.reset();
    setSubmitError(undefined);
    setIsDialogOpen(true);
  };

  return (
    <Page description="Monitor synchronization and background work across the labeling platform." label="Jobs">
      <div className="flex justify-end">
        <button className="btn" onClick={openDialog} type="button">
          Trigger a job
        </button>
      </div>
      <DataGrid
        caption="Jobs"
        columns={columns}
        data={data}
        error={error}
        hasNextPage={Boolean(pageResult?.isOk && pageResult.value.length > pagination.pageSize)}
        isFetching={query.isFetching}
        isPending={query.isPending}
        paginationAtom={paginationAtom}
        sortingAtom={sortingAtom}
      />

      <FormModal
        error={submitError}
        isOpen={isDialogOpen}
        isSubmitting={createJobMutation.isPending}
        onClose={() => setIsDialogOpen(false)}
        onSubmit={submitJob}
        submitLabel="Queue job"
        title="Trigger a job"
      >
        <fieldset className="fieldset">
          <legend className="fieldset-legend">Job type</legend>
          <select className="select select-bordered w-full" defaultValue="sync-printers" name="type" required>
            <option value="sync-printers">Synchronize printers</option>
            <option value="sync-labels">Synchronize labels</option>
          </select>
        </fieldset>
      </FormModal>
    </Page>
  );
};
