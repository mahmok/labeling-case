import type { JSX, ReactNode, SubmitEventHandler } from "react";
import { useEffect, useId, useRef } from "react";

export type FormModalProps = {
  children: ReactNode;
  error?: string;
  isOpen: boolean;
  isSubmitting: boolean;
  isSubmitDisabled?: boolean;
  onClose: () => void;
  onSubmit: SubmitEventHandler<HTMLFormElement>;
  submitLabel: string;
  title: string;
};

export const FormModal = ({
  children,
  error,
  isOpen,
  isSubmitting,
  isSubmitDisabled = false,
  onClose,
  onSubmit,
  submitLabel,
  title,
}: FormModalProps): JSX.Element => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <dialog aria-labelledby={titleId} className="modal" onClose={onClose} ref={dialogRef}>
      <div className="modal-box max-h-[85vh] w-full max-w-lg overflow-y-auto">
        <h2 className="text-lg font-bold" id={titleId}>
          {title}
        </h2>
        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          {children}
          {error ? (
            <div className="alert alert-error" role="alert">
              <span>{error}</span>
            </div>
          ) : null}
          <div className="modal-action">
            <button className="btn btn-ghost" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="btn" disabled={isSubmitting || isSubmitDisabled} type="submit">
              {isSubmitting ? <span className="loading loading-spinner loading-xs" /> : null}
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
      <form className="modal-backdrop" method="dialog">
        <button aria-label="Close dialog" type="submit">
          close
        </button>
      </form>
    </dialog>
  );
};
