import { AiLabel, Card } from "@/components";

import type { AiState } from "./use-ai-result";
import type { ReactNode } from "react";

type Ready = { status: "ready" };
type NotReady = { status: "rejected" | "failed"; error: string | null };

type AiResultCardProps<T extends Ready | NotReady> = {
  state: AiState<T>;
  onRun: () => void;
  copy: { running: string; failed: string };
  children: (result: Extract<T, Ready>) => ReactNode;
  title: string;
  /** Right of the title once ready, e.g. the AI pill. */
  aside?: (result: Extract<T, Ready>) => ReactNode;
};

const button =
  "h-7 cursor-pointer self-start rounded-md border-0 bg-purple px-3 text-xs font-semibold text-white hover:opacity-90";
const muted = "m-0 text-[13px] leading-normal text-fg-muted";

/** An AI card around its result's states: loading, running, ready, rejected by our checks, failed. */
export function AiResultCard<T extends Ready | NotReady>({
  title,
  aside,
  state,
  onRun,
  copy,
  children,
}: AiResultCardProps<T>) {
  const ready = state.status === "done" && isReady(state.result) ? state.result : null;
  const refused = state.status === "done" && isRefused(state.result) ? state.result : null;
  return (
    <Card
      tone="ai"
      title={<AiLabel>{title}</AiLabel>}
      aside={ready && aside?.(ready)}
      className="gap-2"
    >
      {state.status === "loading" && <span className={muted}>Loading…</span>}
      {state.status === "running" && (
        <span role="status" className="text-[13px] text-fg-muted italic">
          {copy.running}
        </span>
      )}
      {ready && children(ready)}
      {refused && (
        <Problem
          heading={refused.status === "rejected" ? "Rejected" : "Failed"}
          text={
            refused.status === "rejected"
              ? "Our checks refused the model's answer, so it is not shown."
              : copy.failed
          }
          detail={refused.error}
          onRetry={onRun}
        />
      )}
      {state.status === "error" && (
        <Problem heading="Failed" text={copy.failed} detail={state.message} onRetry={onRun} />
      )}
    </Card>
  );
}

function isReady<T extends Ready | NotReady>(result: T): result is Extract<T, Ready> {
  return result.status === "ready";
}

function isRefused<T extends Ready | NotReady>(result: T): result is T & NotReady {
  return result.status !== "ready";
}

function Problem({
  heading,
  text,
  detail,
  onRetry,
}: {
  heading: string;
  text: string;
  detail: string | null;
  onRetry: () => void;
}) {
  return (
    <>
      <span className="text-[13px] font-semibold text-fg-muted">{heading}</span>
      <p className={muted}>{text}</p>
      {detail && <p className="m-0 text-[11px] break-words text-fg-subtle">{detail}</p>}
      <button type="button" className={button} onClick={onRetry}>
        Retry
      </button>
    </>
  );
}

/** The activity refs a claim rests on. */
export function Refs({ refs }: { refs: string[] }) {
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-baseline">
      {refs.map((ref) => (
        <span
          key={ref}
          title={`Rests on ${ref}`}
          className="rounded bg-white/60 px-1 font-mono text-[10px] text-ai-fg"
        >
          {ref}
        </span>
      ))}
    </span>
  );
}
