import type { JSX } from "react";
import { Dialog } from "../../lib/components/dialog.tsx";
import type { Job } from "../api.tsx";

type JobResultDialogProps = { job: Job | null; onClose: () => void };

export const JobResultDialog = ({ job, onClose }: JobResultDialogProps): JSX.Element => (
  <Dialog
    boxClassName="max-h-[85vh] w-full max-w-3xl overflow-y-auto"
    isOpen={job !== null}
    onClose={onClose}
    title={job ? `Result · ${job.type}` : "Job result"}
  >
    <pre className="max-h-[65vh] overflow-auto rounded-box bg-base-200 p-4 font-mono text-sm leading-6">
      <code>{JSON.stringify(job?.result ?? null, null, 2)}</code>
    </pre>
  </Dialog>
);
