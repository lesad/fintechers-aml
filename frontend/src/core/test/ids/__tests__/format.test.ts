import { expect, test } from "vitest";

import { deriveTestId, kebab } from "../format";

test("kebab lowercases and hyphenates camelCase segments", () => {
  expect(kebab("matchRecord")).toBe("match-record");
  expect(kebab("signIn")).toBe("sign-in");
  expect(kebab("email")).toBe("email");
});

test("kebab keeps dotted paths as dotted, kebabbing each part", () => {
  expect(kebab("assignedStates.0.deviceId")).toBe("assigned-states.0.device-id");
});

test("kebab is idempotent on already-derived ids", () => {
  expect(kebab("match-record.team-a")).toBe("match-record.team-a");
});

test("deriveTestId joins prefix and local with a dot", () => {
  expect(deriveTestId("match-record", "submit")).toBe("match-record.submit");
  expect(deriveTestId("players.42", "remove")).toBe("players.42.remove");
});

test("deriveTestId with no prefix returns the local name", () => {
  expect(deriveTestId(undefined, "submit")).toBe("submit");
  expect(deriveTestId("", "submit")).toBe("submit");
});
