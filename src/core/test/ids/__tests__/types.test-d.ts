// oxlint-disable no-underscore-dangle -- `_`-prefixed exports are type-level probes (checked by tsc, never used at runtime)
import type { WithRequiredTestId } from "../types";

type Base = { onClick?: () => void; label: string };
type P = WithRequiredTestId<Base>;

// handler present ⇒ testId required (valid)
export const _ok: P = { onClick: () => {}, label: "x", testId: "y" };

// @ts-expect-error onClick present ⇒ testId is required
export const _missingTestId: P = { onClick: () => {}, label: "x" };

// no handler ⇒ testId optional (valid)
export const _noHandler: P = { label: "x" };

// custom handler name
type ChangeBase = { onChange?: (v: string) => void; label: string };
type PC = WithRequiredTestId<ChangeBase, "onChange">;
export const _okChange: PC = { onChange: () => {}, label: "x", testId: "y" };
// @ts-expect-error onChange present ⇒ testId is required
export const _missingChange: PC = { onChange: () => {}, label: "x" };
