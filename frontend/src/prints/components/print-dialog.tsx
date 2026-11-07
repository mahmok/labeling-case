import type { JSX, SubmitEvent } from "react";
import { useState } from "react";
import type { Label } from "../../labels/api.tsx";
import { useLabels } from "../../labels/api.tsx";
import { FormModal } from "../../lib/components/form-modal.tsx";
import type { Result } from "../../lib/result.ts";
import type { Printer } from "../../printers/api.tsx";
import { usePrinters } from "../../printers/api.tsx";
import { useCreatePrint } from "../api.tsx";

type PrintDialogProps = { isOpen: boolean; onClose: () => void };

const getOptionsError = ({
  labelsResult,
  printersResult,
  labels,
  printers,
  isLoading,
}: {
  labelsResult: Result<Label[], Error> | undefined;
  printersResult: Result<Printer[], Error> | undefined;
  labels: Label[];
  printers: Printer[];
  isLoading: boolean;
}): string | undefined => {
  if (labelsResult && !labelsResult.isOk) return labelsResult.error.message;
  if (printersResult && !printersResult.isOk) return printersResult.error.message;
  if (isLoading) return undefined;
  if (labels.length === 0) return "No labels are available to print.";
  if (printers.length === 0) return "No printers are available.";
  return undefined;
};

export const PrintDialog = ({ isOpen, onClose }: PrintDialogProps): JSX.Element => {
  const [submitError, setSubmitError] = useState<string>();
  const createPrintMutation = useCreatePrint();
  const labelsQuery = useLabels({ limit: 100, sort: ["+name"] });
  const printersQuery = usePrinters({ limit: 100, sort: ["+name"] });
  const labels = labelsQuery.data?.isOk ? labelsQuery.data.value : [];
  const printers = printersQuery.data?.isOk ? printersQuery.data.value : [];
  const optionsLoading = labelsQuery.isPending || printersQuery.isPending;
  const optionError = getOptionsError({
    isLoading: optionsLoading,
    labels,
    labelsResult: labelsQuery.data,
    printers,
    printersResult: printersQuery.data,
  });

  const closeDialog = (): void => {
    setSubmitError(undefined);
    createPrintMutation.reset();
    onClose();
  };

  const submitPrint = async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const printResult = await createPrintMutation.mutateAsync({
      labelId: String(formData.get("labelId") ?? ""),
      printerName: String(formData.get("printerName") ?? ""),
    });
    if (printResult.isOk) {
      closeDialog();
    } else {
      setSubmitError(printResult.error.message);
    }
  };

  return (
    <FormModal
      error={submitError ? submitError : optionError}
      isOpen={isOpen}
      isSubmitDisabled={optionsLoading || labels.length === 0 || printers.length === 0}
      isSubmitting={createPrintMutation.isPending}
      onClose={closeDialog}
      onSubmit={submitPrint}
      submitLabel="Print"
      title="Print a label"
    >
      <fieldset className="fieldset">
        <legend className="fieldset-legend">Label</legend>
        <select className="select select-bordered w-full" defaultValue="" name="labelId" required>
          <option disabled value="">
            {optionsLoading ? "Loading labels…" : "Select a label"}
          </option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name} · {label.version}
            </option>
          ))}
        </select>
      </fieldset>
      <fieldset className="fieldset">
        <legend className="fieldset-legend">Printer</legend>
        <select className="select select-bordered w-full" defaultValue="" name="printerName" required>
          <option disabled value="">
            {optionsLoading ? "Loading printers…" : "Select a printer"}
          </option>
          {printers.map((printer) => (
            <option key={printer.id} value={printer.name}>
              {printer.nickname || printer.name} · {printer.location}
            </option>
          ))}
        </select>
      </fieldset>
      {optionsLoading ? <span className="loading loading-spinner loading-sm" /> : null}
    </FormModal>
  );
};
