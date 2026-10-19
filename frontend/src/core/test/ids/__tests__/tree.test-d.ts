// oxlint-disable no-underscore-dangle -- `_`-prefixed exports are type-level probes (checked by tsc, never used at runtime)
import { action, field, group, tree, type TestIdNode } from "../tree";

const T = tree({
  home: group("home", { cta: action("cta") }),
  form: group("form", { email: field("email"), submit: action("submit") }),
});

// meta is typed on every node
export const _id: string = T.home.$id;
export const _path: readonly string[] = T.home.cta.$path;

// children keys are reachable and are nodes
export const _leaf: TestIdNode = T.home.cta;
export const _field: TestIdNode = T.form.email;

// @ts-expect-error there is no `missing` child under `home`
export const _bad = T.home.missing;

// @ts-expect-error a leaf has no children to descend into
export const _badLeaf = T.home.cta.nope;
