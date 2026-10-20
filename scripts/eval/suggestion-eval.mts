// Walks the reviewer's path through the engine API for sampled alerts: detail, AI Rating, a false-positive reason
// written by a simulated reviewer, the rule suggestion, then scores it in code and with a grader model.
// Dev tool for iterating on engine/src/main/resources/prompts/rule-suggestion.md; see engine/README.md.
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "../../data/out/eval");

type Mode = "pattern" | "one-off" | "trap";
type Rating = "High" | "Medium" | "Low";

const args = parseArgs(process.argv.slice(2));
const ENGINE = args.engine ?? process.env.ENGINE_URL ?? "http://127.0.0.1:8090";
const PROFILE = process.env.AWS_PROFILE ?? "hackathon";
const REGION = "eu-central-1";
const REVIEWER_MODEL = "eu.anthropic.claude-sonnet-4-5-20250929-v1:0";
const GRADER_MODEL = "eu.anthropic.claude-opus-4-5-20251101-v1:0";
const PER_RATING = Number(args["per-rating"] ?? 4);
const REPS = Number(args.reps ?? 3);
const CONCURRENCY = Number(args.concurrency ?? 4);
const SEED = Number(args.seed ?? 1);

function parseArgs(argv: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") continue;
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[a.slice(2)] = "true";
    else out[a.slice(2)] = argv[++i];
  }
  return out;
}

async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(`${ENGINE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-User-Id": "1", ...init?.headers },
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

async function ask(model: string, system: string, input: unknown, temperature: number): Promise<any> {
  const { stdout } = await run(
    "aws",
    [
      "bedrock-runtime", "converse", "--model-id", model, "--region", REGION, "--profile", PROFILE, "--output", "json",
      "--system", JSON.stringify([{ text: system }]),
      "--messages", JSON.stringify([{ role: "user", content: [{ text: JSON.stringify(input) }] }]),
      "--inference-config", JSON.stringify({ maxTokens: 1500, temperature }),
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  const text: string = JSON.parse(stdout).output.message.content[0].text;
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json);
}

// A small seeded PRNG so a run with the same seed samples the same cases.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const random = rng(SEED);
const modeRandom = rng(SEED + 1);

// The research's mix (docs/challenge/aml-review-workflow.md): about 60 % pattern, 25 % one-off, 15 % trap.
function modeFor(i: number): Mode {
  if (args.mode && args.mode !== "all") return args.mode as Mode;
  void i;
  const r = modeRandom();
  return r < 0.6 ? "pattern" : r < 0.85 ? "one-off" : "trap";
}

type Case = { txId: string; rating: Rating | "?"; mode: Mode };

async function pickCases(): Promise<Case[]> {
  if (args.ids) {
    const modes = (args.modes ?? "").split(",");
    return args.ids.split(",").map((txId, i) => ({ txId, rating: "?" as const, mode: (modes[i] as Mode) || modeFor(i) }));
  }
  const cases: Case[] = [];
  for (const rating of ["High", "Medium", "Low"] as Rating[]) {
    const first = await api<{ total: number }>(`/api/transactions?rating=${rating}&status=NEW&size=1`);
    const total = first.body.total;
    const seen = new Set<number>();
    while (seen.size < Math.min(PER_RATING, total)) {
      const index = Math.floor(random() * total);
      if (seen.has(index)) continue;
      seen.add(index);
      const page = await api<{ items: { id: string }[] }>(`/api/transactions?rating=${rating}&status=NEW&size=1&page=${index}`);
      const id = page.body.items[0]?.id;
      if (id) cases.push({ txId: id, rating, mode: modeFor(cases.length) });
    }
  }
  return cases;
}

async function rating(alertId: number): Promise<any> {
  const got = await api<any>(`/api/alerts/${alertId}/assessment`);
  if (got.status === 200 && got.body.status === "ready") return got.body.body;
  const made = await api<any>(`/api/alerts/${alertId}/assessment`, { method: "POST" });
  return made.body?.status === "ready" ? made.body.body : null;
}

type Outcome = "fired" | `declined:${string}` | "none:model" | `rejected:${string}` | `error:${string}`;

function outcomeOf(status: number, body: any): Outcome {
  if (status === 502) return `rejected:${String(body?.detail ?? "").slice(0, 120)}`;
  if (status !== 200) return `error:${status}`;
  if (body.declined) return `declined:${body.declined}`;
  if (body.kind === "rule_version") return "fired";
  if (body.kind === "none") return "none:model";
  return `error:kind ${body.kind}`;
}

const reviewerSystem = readFileSync(join(here, "reviewer-prompt.md"), "utf8");
const graderSystem = readFileSync(join(here, "grader-prompt.md"), "utf8");
const CATEGORIES: Record<Mode, string[]> = {
  pattern: ["declared_business", "counterparty", "own_accounts", "seasonal", "corridor"],
  "one-off": ["one-off", "one_off"],
  trap: ["pep_routine", "unverified", "outdated_profile"],
};
let activeRules: Record<string, any> = {};
// A 502 carries no prompt hash; the engine serves one prompt at a time, so the last hash seen stands in.
let lastHash: string | null = null;

async function runCase(c: Case, file: string) {
  const detail = (await api<any>(`/api/transactions/${c.txId}`)).body;
  for (const alert of detail.alerts as any[]) {
    const ai = await rating(alert.id);
    const reviewerInput = {
      mode: c.mode,
      transaction: detail.transaction,
      client: detail.client,
      alert: { type: alert.alertType, hits: alert.hits.slice(0, 12).map((h: any) => ({ rule: h.rule, name: h.name, grainKey: h.grainKey, evidence: h.evidence })) },
      triage: alert.triage,
      aiRating: ai,
      day: detail.day,
    };
    let review: { reason: string; category: string; intendedScope: string };
    try {
      review = await ask(REVIEWER_MODEL, reviewerSystem, reviewerInput, 0.7);
      // The reviewer sometimes answers in the mode it finds likelier; one retry, then the case is not scored.
      if (!CATEGORIES[c.mode].includes(review.category)) review = await ask(REVIEWER_MODEL, reviewerSystem, reviewerInput, 0.7);
      if (!CATEGORIES[c.mode].includes(review.category)) throw new Error(`off mode: ${review.category}`);
    } catch (e) {
      record(file, { ...c, alertId: alert.id, alertType: alert.alertType, outcome: `error:reviewer ${(e as Error).message.slice(0, 80)}` });
      continue;
    }
    const graded = new Map<string, any>();
    for (let rep = 1; rep <= REPS; rep++) {
      const res = await api<any>(`/api/alerts/${alert.id}/suggestion`, { method: "POST", body: JSON.stringify({ reason: review.reason }) });
      const outcome = outcomeOf(res.status, res.body);
      if (res.body?.promptHash) lastHash = res.body.promptHash;
      const scope = res.body?.impact ? (res.body.impact.company ?? res.body.impact.client) : null;
      let grade: any = null;
      if (outcome === "fired") {
        const rule = res.body.rule;
        const key = `${rule.condition}|${JSON.stringify(rule.params)}`;
        if (!graded.has(key)) {
          const base = activeRules[rule.replacesKey ?? rule.key] ?? activeRules[rule.key.split("-")[0]];
          graded.set(key, await ask(GRADER_MODEL, graderSystem, {
            reason: review.reason, category: review.category, intendedScope: review.intendedScope, mode: c.mode,
            baseRule: base && { key: base.key, condition: base.condition, params: base.params },
            suggestion: { key: rule.key, layer: rule.layer, condition: rule.condition, params: rule.params, previousParams: res.body.previousParams, ruleExplanation: res.body.ruleExplanation, impact: res.body.impact },
          }, 0).catch((e) => ({ error: (e as Error).message.slice(0, 80) })));
        }
        grade = graded.get(key);
      }
      record(file, {
        ...c, alertId: alert.id, alertType: alert.alertType, disposition: alert.triage?.disposition, aiRating: ai?.rating, aiVerdict: ai?.verdict,
        category: review.category, intendedScope: review.intendedScope, reason: review.reason, rep, outcome,
        promptHash: res.body?.promptHash ?? lastHash, explanation: (res.body?.explanation ?? []).map((s: any) => s.text).join(" ") || null, ruleKey: res.body?.rule?.key ?? null, layer: res.body?.rule?.layer ?? null,
        condition: res.body?.rule?.condition ?? null, params: res.body?.rule?.params ?? null, ruleExplanation: res.body?.ruleExplanation ?? null,
        stopsThisAlert: res.body?.impact?.stopsThisAlert ?? null, closesThisAlert: res.body?.impact?.closesThisAlert ?? null,
        hitsStopped: scope?.hitsStopped ?? null, alertsClosed: scope?.alertsClosed ?? null, grade,
      });
    }
  }
}

function record(file: string, row: Record<string, unknown>) {
  appendFileSync(file, JSON.stringify(row) + "\n");
  const g = row.grade as any;
  console.log(`${row.txId} ${row.alertType} ${row.mode} rep${row.rep ?? "-"} ${row.outcome}${row.hitsStopped != null ? ` hits=${row.hitsStopped} closed=${row.alertsClosed}` : ""}${g ? ` grade=${g.faithful}/${g.scope}/remedy:${g.remedyFits}` : ""}`);
}

const pct = (n: number, d: number) => (d === 0 ? "-" : `${Math.round((100 * n) / d)} %`);

function summarize(rows: any[]): string {
  const lines: string[] = [];
  for (const hash of [...new Set(rows.map((r) => r.promptHash ?? "unknown"))]) {
    const ofHash = rows.filter((r) => (r.promptHash ?? "unknown") === hash || (hash === "unknown" && !r.promptHash));
    lines.push(`## Prompt ${hash}`, "", "| group | runs | fired | none | declined | rejected | error | success | grader pass | too broad | remedy fits | mean hits stopped |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
    const groups: [string, (r: any) => boolean][] = [
      ["all", () => true],
      ...(["pattern", "one-off", "trap"] as const).map((m) => [`mode ${m}`, (r: any) => r.mode === m] as [string, (r: any) => boolean]),
      ...(["High", "Medium", "Low"] as const).map((x) => [`rating ${x}`, (r: any) => r.rating === x] as [string, (r: any) => boolean]),
      ...(["A", "B", "C"] as const).map((t) => [`type ${t}`, (r: any) => r.alertType === t] as [string, (r: any) => boolean]),
    ];
    for (const [name, pick] of groups) {
      const g = ofHash.filter(pick);
      if (g.length === 0) continue;
      const fired = g.filter((r) => r.outcome === "fired");
      const ok = g.filter((r) => (r.mode === "pattern" ? r.outcome === "fired" : r.outcome === "none:model"));
      const graded = fired.filter((r) => r.grade && !r.grade.error);
      const hits = fired.map((r) => r.hitsStopped ?? 0);
      lines.push(`| ${name} | ${g.length} | ${fired.length} | ${g.filter((r) => r.outcome === "none:model").length} | ${g.filter((r) => r.outcome.startsWith("declined")).length} | ${g.filter((r) => r.outcome.startsWith("rejected")).length} | ${g.filter((r) => r.outcome.startsWith("error")).length} | ${pct(ok.length, g.length)} | ${pct(graded.filter((r) => r.grade.faithful === "pass").length, graded.length)} | ${pct(graded.filter((r) => r.grade.scope === "too_broad").length, graded.length)} | ${pct(graded.filter((r) => r.grade.remedyFits).length, graded.length)} | ${hits.length ? (hits.reduce((a, b) => a + b, 0) / hits.length).toFixed(1) : "-"} |`);
    }
    const reasons = new Map<string, number>();
    for (const r of ofHash.filter((r) => r.outcome.startsWith("declined") || r.outcome.startsWith("rejected"))) {
      const k = r.outcome.replace(/\d[\d,.]*/g, "N").slice(0, 110);
      reasons.set(k, (reasons.get(k) ?? 0) + 1);
    }
    if (reasons.size) lines.push("", "Declines and rejections:", ...[...reasons].sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${n} × ${k}`));
    lines.push("", "Success: pattern fired, one-off and trap answered none. A gate decline counts as no success in every mode.", "");
  }
  return lines.join("\n");
}

async function main() {
  if (args.compare) {
    for (const f of args.compare.split(",")) {
      console.log(`# ${f}\n`);
      console.log(summarize(readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l))));
    }
    return;
  }
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(outDir, `${stamp}.jsonl`);
  const rules = (await api<any[]>("/api/rules")).body;
  activeRules = Object.fromEntries(rules.filter((r) => r.status === "active").map((r) => [r.key, r]));
  const cases = await pickCases();
  console.log(`${cases.length} cases × ${REPS} reps against ${ENGINE}; results in ${file}`);
  const queue = [...cases];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) await runCase(c, file).catch((e) => console.error(`${c!.txId}: ${(e as Error).message}`));
    }),
  );
  const rows = readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const summary = summarize(rows);
  writeFileSync(file.replace(/\.jsonl$/, ".md"), summary);
  console.log(`\n${summary}`);
}

await main();
