import { kebab } from "./format";

export type TestIdKind = "group" | "action" | "field";

/** A node in the test-id hierarchy. `$id` is the bare (kebab) local id; `$path` is the full ancestor chain incl. self, stamped by `tree()`. */
export type TestIdNode = {
  readonly $id: string;
  readonly $path: readonly string[];
  readonly $kind: TestIdKind;
};

type Children = Record<string, TestIdNode>;

/** Interactive-leaf node (verb): its `$id` is the action name. */
export function action(id: string): TestIdNode {
  return { $id: kebab(id), $path: [], $kind: "action" };
}

/** Form-field leaf node: its `$id` is the react-hook-form field name. */
export function field(id: string): TestIdNode {
  return { $id: kebab(id), $path: [], $kind: "field" };
}

/** Group wrapper (noun): carries a group `$id` and exposes its children as keys. */
export function group<C extends Children>(id: string, children: C): TestIdNode & C {
  return { $id: kebab(id), $path: [], $kind: "group", ...children } as TestIdNode & C;
}

function build(node: TestIdNode, parentPath: readonly string[]): TestIdNode {
  const path = [...parentPath, node.$id];
  const rebuilt: Record<string, unknown> = { $id: node.$id, $path: path, $kind: node.$kind };
  // Non-`$` keys are always child nodes by construction (group/action/field); TS can't see that
  // from TestIdNode's declared members, and it widens the value to the union of *those* members
  // (`string | readonly string[]`), which doesn't overlap TestIdNode — hence via `unknown`.
  for (const [key, child] of Object.entries(node) as unknown as [string, TestIdNode][]) {
    if (key.startsWith("$")) continue;
    rebuilt[key] = build(child, path);
  }
  return Object.freeze(rebuilt) as unknown as TestIdNode;
}

/** Root of a test-id hierarchy: stamps each node's absolute `$path` and freezes the tree. */
export function tree<T extends Children>(def: T): T {
  const out: Record<string, TestIdNode> = {};
  for (const [key, node] of Object.entries(def)) out[key] = build(node, []);
  return Object.freeze(out) as unknown as T;
}

/** The chain of ids to walk (`getByTestId` per segment) to reach `node` from the document root. */
export function chain(node: TestIdNode): readonly string[] {
  return node.$path;
}
