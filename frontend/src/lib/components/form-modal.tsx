import type { JSX, ReactNode, SubmitEventHandler } from "react";
import { Dialog } from "./dialog.tsx";

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
}: FormModalProps): JSX.Element => (
  <Dialog isOpen={isOpen} onClose={onClose} title={title}>
    <form className="space-y-4" onSubmit={onSubmit}>
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
  </Dialog>
);
