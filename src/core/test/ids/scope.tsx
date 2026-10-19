import { createContext, use, type ReactNode } from "react";

import { deriveTestId } from "./format";

const TestIdContext = createContext<string>("");

export function TestIdScope({ testId, children }: { testId: string; children: ReactNode }) {
  const parent = use(TestIdContext);
  // oxlint-disable-next-line react/jsx-no-constructed-context-values -- React Compiler memoizes this; manual useMemo is banned (CLAUDE.md → React Compiler)
  return <TestIdContext value={deriveTestId(parent, testId)}>{children}</TestIdContext>;
}

export function useTestId(local: string): string {
  return deriveTestId(use(TestIdContext), local);
}
