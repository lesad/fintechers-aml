import { useEffect } from "react";
import { Link } from "react-router";

type ToastProps = {
  message: string;
  /** An in-app link after the message. */
  link?: { to: string; label: string };
  /** Called once the toast has shown for [duration] ms; the caller unmounts it. */
  onDone: () => void;
  duration?: number;
};

/** A short confirmation at the bottom right that goes away on its own. */
export function Toast({ message, link, onDone, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, duration);
    return () => clearTimeout(timer);
  }, [onDone, duration]);

  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 flex items-center gap-3 rounded-md bg-fg px-3.5 py-2.5 text-[13px] font-semibold text-bg shadow-card"
    >
      {message}
      {link && (
        <Link to={link.to} className="text-bg underline hover:opacity-80">
          {link.label}
        </Link>
      )}
    </div>
  );
}
