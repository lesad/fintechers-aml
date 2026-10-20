import { z } from "zod";

import { userHeaders } from "@/user";

// The engine's data import contract (engine/.../importer/ImportController.kt).

const job = z.object({
  id: z.number(),
  /** Null for a recalculation after a rule approval, which has no file. */
  fileName: z.string().nullable(),
  fileSize: z.number().nullable(),
  /** The approved rule version that started a recalculation, e.g. "B2 v3"; null for an upload. */
  rule: z.string().nullable(),
  by: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  stage: z.enum(["VALIDATE", "IMPORT", "RUN", "DONE", "FAILED"]),
  /** Null while it runs. */
  status: z.enum(["COMPLETED", "PARTIAL", "FAILED"]).nullable(),
  rowsTotal: z.number().nullable(),
  rowsImported: z.number(),
  rowsRejected: z.number(),
  alerts: z.number().nullable(),
  note: z.string().nullable(),
});

const counts = z.object({ transactions: z.number(), alerts: z.number() });
const problem = z.object({ message: z.string() });

export type ImportJob = z.infer<typeof job>;
export type DataCounts = z.infer<typeof counts>;

async function call<T>(url: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...userHeaders(), ...init.headers },
  });
  if (!res.ok) {
    const parsed = problem.safeParse(await res.json().catch(() => null));
    throw new Error(parsed.success ? parsed.data.message : `${url}: HTTP ${res.status}`);
  }
  return schema.parse(res.status === 204 ? null : await res.json());
}

/** Starts importing a transactions CSV; resolves with the job to follow. */
export function uploadTransactions(file: File): Promise<ImportJob> {
  const body = new FormData();
  body.append("file", file);
  return call("/api/imports", job, { method: "POST", body });
}

export const fetchImports = (signal?: AbortSignal) =>
  call("/api/imports", z.array(job), { signal });

export const fetchImport = (id: number) => call(`/api/imports/${id}`, job);

/** How many transactions and alerts a reset would delete. */
export const fetchCounts = () => call("/api/data", counts);

/** Deletes every transaction and its alerts. */
export const deleteTransactions = () => call("/api/data", z.null(), { method: "DELETE" });
