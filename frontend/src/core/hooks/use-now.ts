import { useEffect, useState } from "react";

/**
 * The current time, renewed every [intervalMs]. A bare `new Date()` in render is memoized by the React Compiler and
 * stays at the first render's time, so an age computed from it drifts, even below zero for later data.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
