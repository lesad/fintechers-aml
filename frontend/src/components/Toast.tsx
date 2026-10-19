import { useEffect } from "react";

type ToastProps = {
  message: string;
  /** Called once the toast has shown for [duration] ms; the caller unmounts it. */
  onDone: () => void;
  duration?: number;
};

/** A short confirmation at the bottom right that goes away on its own. */
export function Toast({ message, onDone, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, duration);
    return () => clearTimeout(timer);
  }, [onDone, duration]);

  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 rounded-md bg-fg px-3.5 py-2.5 text-[13px] font-semibold text-bg shadow-card"
    >
      {message}
    </div>
  );
}
