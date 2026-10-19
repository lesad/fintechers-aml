# `src/core/test/ids` — portable test-id system

Stable, hierarchical `data-testid`s shared between components and tests, so ids aren't stringly-typed and scattered. All ids are kebab-cased (`format.ts`). Three complementary tools:

## 1. Static tree — known structure

`tree.ts`:

```ts
export const T = tree({
  home: group("home", { cta: action("get-started"), email: field("email") }),
});
```

- `group(id, children)` — noun wrapper (children exposed as keys).
- `action(id)` / `field(id)` — interactive / form-field leaves.
- `tree(def)` — stamps each node's absolute `$path` and freezes it.
- `chain(node)` → id segments from root to the node.

## 2. Runtime scope — dynamic composition

`scope.tsx`, for ids not known statically (e.g. list rows):

- `<TestIdScope testId="row">…</TestIdScope>` nests a dotted prefix via context.
- `useTestId("delete")` → `"row.delete"` within that scope.

## 3. Type guard

`types.ts` — `WithRequiredTestId<Props>` makes `testId` mandatory whenever an interactive handler (`onClick`/`onChange`) is present; a handler without a `testId` is a compile error.

Tests are grouped in `__tests__/` (this module has several): `*.test-d.ts` = type-level tests · `*.test.ts(x)` = runtime tests.
