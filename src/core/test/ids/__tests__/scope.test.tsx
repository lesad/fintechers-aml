import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { TestIdScope, useTestId } from "../scope";

function Probe({ name }: { name: string }) {
  return <span data-testid={useTestId(name)} />;
}

test("useTestId with no scope returns the local name", () => {
  expect(renderToStaticMarkup(<Probe name="submit" />)).toContain('data-testid="submit"');
});

test("TestIdScope prefixes descendants", () => {
  const html = renderToStaticMarkup(
    <TestIdScope testId="match-record">
      <Probe name="submit" />
    </TestIdScope>,
  );
  expect(html).toContain('data-testid="match-record.submit"');
});

test("nested scopes accumulate", () => {
  const html = renderToStaticMarkup(
    <TestIdScope testId="players">
      <TestIdScope testId="row">
        <Probe name="remove" />
      </TestIdScope>
    </TestIdScope>,
  );
  expect(html).toContain('data-testid="players.row.remove"');
});
