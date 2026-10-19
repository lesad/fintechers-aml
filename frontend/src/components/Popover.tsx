import { useEffect, useRef } from "react";

import { cn } from "@/utils";

import type { ReactNode, RefObject } from "react";

type PopoverProps = {
  /** The button that toggles it: a click there is the button's to handle, not an outside click. */
  anchor: RefObject<HTMLElement | null>;
  /** A click anywhere else or Escape; the caller unmounts the panel. */
  onClose: () => void;
  className?: string;
  children: ReactNode;
};

/** A small panel under its anchor (place both in a `relative` wrapper), closed by an outside click or Escape. */
export function Popover({ anchor, onClose, className, children }: PopoverProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !anchor.current?.contains(target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  return (
    <div
      ref={panel}
      className={cn(
        "absolute top-full right-0 z-20 mt-2 flex flex-col gap-1.5 rounded-md bg-bg p-3 text-fg shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}
