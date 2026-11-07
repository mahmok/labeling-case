import type { JSX, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";

export type DialogProps = {
  boxClassName?: string;
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title: string;
};

export const Dialog = ({
  boxClassName = "max-h-[85vh] w-full max-w-lg overflow-y-auto",
  children,
  isOpen,
  onClose,
  title,
}: DialogProps): JSX.Element => {
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
      <div className={`modal-box ${boxClassName}`}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold" id={titleId}>
            {title}
          </h2>
          <button aria-label="Close dialog" className="btn btn-circle btn-ghost btn-sm" onClick={onClose} type="button">
            ×
          </button>
        </div>
        {children}
      </div>
      <form className="modal-backdrop" method="dialog">
        <button aria-label="Close dialog" type="submit">
          close
        </button>
      </form>
    </dialog>
  );
};
