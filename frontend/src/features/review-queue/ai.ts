import { z } from "zod";

// The engine's AiResult envelope (engine/.../ai/AiResult.kt, ADR-0043), for the AI assessment.
// GET is 404 until a kind ran once; POST always answers 200 with `ready`, `rejected` or `failed`.

export type AiKind = "assessment";

/** One model sentence and the activity refs it rests on. */
const claim = z.object({ text: z.string(), refs: z.array(z.string()) });

const VERDICTS = [
  "pass_through",
  "funnel",
  "mule",
  "structuring",
  "pep_proceeds",
  "regular_supplier",
  "salary_or_payroll",
  "own_accounts",
  "seasonal_business",
  "unclear",
] as const;

const assessmentBody = z.object({
  rating: z.enum(["high", "medium", "low"]),
  verdict: z.enum(VERDICTS),
  summary: z.array(claim).min(1).max(6),
  openPoints: z
    .array(
      z.object({
        question: claim,
        suspicious: z.string(),
        normal: z.string(),
        wouldSettle: z.string(),
        askWho: z.enum(["client", "account_manager", "analyst"]),
      }),
    )
    .max(3),
  // Checks the result passed with a remark, e.g. a number the input does not hold (ADR-0046); older rows have none.
  // `numbers` are the flagged numbers as the text writes them, so the card marks just those.
  warnings: z
    .array(
      z.object({ at: z.string(), message: z.string(), numbers: z.array(z.string()).default([]) }),
    )
    .default([]),
});

function resultOf<B extends z.ZodType>(kind: AiKind, body: B) {
  const base = {
    alertId: z.number(),
    kind: z.literal(kind),
    modelId: z.string(),
    promptHash: z.string(),
    inputHash: z.string(),
    createdAt: z.string(),
  };
  return z.discriminatedUnion("status", [
    z.object({ ...base, status: z.literal("ready"), body, error: z.null() }),
    z.object({
      ...base,
      status: z.enum(["rejected", "failed"]),
      body: z.null(),
      error: z.string().nullable(),
    }),
  ]);
}

/** One kind's endpoint and the schema its envelope is parsed with. */
export type AiEndpoint<T> = { kind: AiKind; schema: z.ZodType<T> };

export const ASSESSMENT = {
  kind: "assessment",
  schema: resultOf("assessment", assessmentBody),
} as const;

export type AssessmentBody = z.infer<typeof assessmentBody>;
type Verdict = AssessmentBody["verdict"];

export const VERDICT_LABEL: Record<Verdict, string> = {
  pass_through: "Pass-through",
  funnel: "Funnel",
  mule: "Mule",
  structuring: "Structuring",
  pep_proceeds: "PEP proceeds",
  regular_supplier: "Regular supplier",
  salary_or_payroll: "Salary or payroll",
  own_accounts: "Own accounts",
  seasonal_business: "Seasonal business",
  unclear: "Unclear",
};

export const ASK_WHO_LABEL: Record<AssessmentBody["openPoints"][number]["askWho"], string> = {
  client: "Client",
  account_manager: "Account manager",
  analyst: "Analyst",
};

const url = (alertId: number, kind: AiKind) => `/api/alerts/${alertId}/${kind}`;

/** The latest stored result, or `null` when the kind never ran on this alert. */
export async function fetchAiResult<T>(
  alertId: number,
  { kind, schema }: AiEndpoint<T>,
  signal?: AbortSignal,
): Promise<T | null> {
  const res = await fetch(url(alertId, kind), { signal, headers: { Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url(alertId, kind)}: HTTP ${res.status}`);
  return schema.parse(await res.json());
}

/** Asks the engine to generate a new result; a refused or failed one still answers 200. */
export async function runAiResult<T>(
  alertId: number,
  { kind, schema }: AiEndpoint<T>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url(alertId, kind), {
    method: "POST",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${url(alertId, kind)}: HTTP ${res.status}`);
  return schema.parse(await res.json());
}
