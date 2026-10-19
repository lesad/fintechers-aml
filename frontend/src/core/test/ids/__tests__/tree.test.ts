import { expect, test } from "vitest";

import { action, chain, field, group, tree } from "../tree";

test("action leaf carries its bare id and a single-segment path under a tree", () => {
  const T = tree({ save: action("save") });
  expect(T.save.$id).toBe("save");
  expect(T.save.$path).toEqual(["save"]);
});

test("group exposes its children as keys and its own id", () => {
  const T = tree({ home: group("home", { cta: action("cta") }) });
  expect(T.home.$id).toBe("home");
  expect(T.home.cta.$id).toBe("cta");
});

test("tree stamps the full ancestor chain onto each node's $path", () => {
  const T = tree({ home: group("home", { cta: action("cta") }) });
  expect(T.home.$path).toEqual(["home"]);
  expect(T.home.cta.$path).toEqual(["home", "cta"]);
});

test("ids are kebab-normalized in both $id and $path", () => {
  const T = tree({ matchRecord: group("matchRecord", { submitForm: action("submitForm") }) });
  expect(T.matchRecord.$id).toBe("match-record");
  expect(T.matchRecord.submitForm.$id).toBe("submit-form");
  expect(T.matchRecord.submitForm.$path).toEqual(["match-record", "submit-form"]);
});

test("deep nesting accumulates the full path", () => {
  const T = tree({
    players: group("players", { row: group("row", { remove: action("remove") }) }),
  });
  expect(T.players.row.remove.$path).toEqual(["players", "row", "remove"]);
});

test("field is a leaf whose id is its name", () => {
  const T = tree({ form: group("form", { email: field("email") }) });
  expect(T.form.email.$id).toBe("email");
  expect(T.form.email.$path).toEqual(["form", "email"]);
});

test("chain(node) returns the node's $path", () => {
  const T = tree({ home: group("home", { cta: action("cta") }) });
  expect(chain(T.home.cta)).toEqual(["home", "cta"]);
});
