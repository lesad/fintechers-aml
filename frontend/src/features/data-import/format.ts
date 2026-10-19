const pad = (n: number) => String(n).padStart(2, "0");

/** An engine timestamp in local time, `2026-10-20 09:14`. */
export const formatStamp = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** `36474908` → `34.8 MB`, `2114` → `3 KB`. */
export const formatSize = (bytes: number) =>
  bytes > 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Time between two engine timestamps: `6s`, `1m 34s`; empty while there is no end. */
export const formatDuration = (from: string, to: string | null) => {
  if (!to) return "";
  const s = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

export const formatCount = (n: number) => n.toLocaleString("en-US");
