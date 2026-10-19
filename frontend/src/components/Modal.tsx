import { useEffect, useRef } from "react";

import { cn } from "@/utils";

import type { ReactNode } from "react";

type ModalProps = {
  /** Accessible name of the dialog. */
  label: string;
  /** Escape, a backdrop click or the close button; the caller unmounts the modal. */
  onClose: () => void;
  /** Fixed at the top, next to the close button. */
  header: ReactNode;
  /** Fixed at the bottom, styled by the caller. */
  footer?: ReactNode;
  className?: string;
  /** The body; the only part that scrolls when the modal is taller than the window. */
  children: ReactNode;
};

/** A modal dialog over a dimmed page: the native `<dialog>`, so focus trap and Escape come free. */
export function Modal({ label, onClose, header, footer, className, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    // The backdrop click has a keyboard twin already: a modal <dialog> closes on Escape natively.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      // A click on the dialog element itself is a click on the backdrop.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cn(
        "m-auto max-h-[calc(100dvh-48px)] w-full max-w-[520px] flex-col overflow-hidden rounded-[10px] bg-bg p-0 text-fg shadow-card backdrop:bg-[rgba(37,39,70,.38)] open:flex",
        className,
      )}
    >
      <div className="flex flex-none items-start gap-3 border-b border-border-soft px-[18px] pt-4 pb-3.5">
        <div className="min-w-0 flex-1">{header}</div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="size-7 flex-none cursor-pointer rounded-md border-0 bg-transparent text-lg leading-none text-fg-muted hover:bg-bg-sub hover:text-fg"
        >
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {footer && <div className="flex-none">{footer}</div>}
    </dialog>
  );
}
