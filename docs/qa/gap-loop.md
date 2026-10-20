# Gap loop: one tick

The procedure a `/loop` tick follows over [gap-ledger.md](gap-ledger.md). One tick works one row. The loop finds gaps; it never fixes them, never commits, never pushes, never calls Bedrock from a test.

## Stop conditions

Stop the loop (no further wakeup) when either holds:

- no row in the ledger has status `TODO`;
- the local clock is past 12:00 on 2026-10-20 (code freeze is 13:30).

Check both before taking a row.

## 1. Take a row

1. Read the ledger and take the **first** row in document order whose status is `TODO`. Do not skip a row because it looks hard; a row the tick cannot finish is set to `BLOCKED` with the reason in Findings, and the next tick takes the next row.
2. Read the row's source section(s) in full: the file and section the `source` column names, and every mentor answer it cites. For an ADR, read that ADR's whole entry.
3. Read the nearest existing test named in the ledger for that area (the `test or scenario path` of the nearest COVERED row) and match its fixture style: the same helper shapes (`client(...)`, `tx(...)`), the same assertion library, the same way of inserting rows and running the engine. Engine tests under `run/` and `triage/` that touch Postgres use `@PostgresTest`; pure functions (`Triage.decide`, `FxTable`, `CanonicalJson`) use plain JUnit.

## 2. Write one test

- One row, one test. The test name starts with the row id: `fun gap012_inactiveClientGetsA1Only()` in Kotlin, `it("GAP-012: ...")` in Vitest.
- **The expected value is derived by hand in a comment from the spec, never from running the code.** Write the derivation above the assertion, citing the source section, for example:

  ```kotlin
  // A §Test cases, DESIGN §Seed rules A2: day_volume * q2_days > avg_multiple * q2_volume.
  // Q2 910 000 over 91 days; day 30 000 -> 2 730 000 = 2 730 000, not strictly above: no hit.
  // Day 30 000.01 -> 2 730 000.91 > 2 730 000: hit A2.
  ```

  If the ledger's `expected` cell disagrees with what the source says on a careful re-read, the source wins: fix the cell, say so in Findings, and derive again. If the source itself is unclear, set the row to `QUESTION`, write what is open, and take the next row.
- Write the test into the file the row's path column names (create it in the package or folder of the nearest existing test when it does not exist). Keep imports and fixtures in the file's own style; do not refactor the neighbouring test.
- Synthetic fixtures only. Never read `data/raw`, never copy a row from it.
- Frontend: tests render through `@/test/render` and stub `fetch` with responses in the engine's shape, as `App.test.tsx` does. Engine: one Postgres container is shared by the suite; truncate what the test needs in `@BeforeEach` the way its neighbours do.

## 3. Quarantine, so `main` stays green

The test's result decides the row status, and the quarantine keeps the suite green either way.

**Engine (Kotlin, JUnit 5).** Tag a test that fails with `@Tag("gap")`. On the first engine tick, add the exclusion and the `gapTest` task to `engine/build.gradle.kts` if they are not there yet:

```kotlin
tasks.test {
    useJUnitPlatform { excludeTags("gap") }
}

tasks.register<Test>("gapTest") {
    description = "Runs the quarantined gap tests from docs/qa/gap-ledger.md"
    group = "verification"
    useJUnitPlatform { includeTags("gap") }
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    shouldRunAfter(tasks.test)
}
```

A test that passes stays **untagged** and joins the normal suite as a regression test.

**Frontend (Vitest).** A test that fails is written as `it.fails("GAP-nnn: ...", ...)`: it passes while the gap exists and goes red once someone fixes the behaviour, which is the signal to turn it back into `it(...)` and set the row to GREEN. A test that passes is a plain `it(...)`.

Both: a lint suppression or an unsafe cast carries its rationale on the line above (repo rule).

## 4. Run only that test, then record

Run the one test, not the suite:

```bash
# engine, a quarantined test
cd engine && ./gradlew gapTest --tests 'cz.morosystems.aml.engine.run.RuleAcceptanceGapTest.gap012_inactiveClientGetsA1Only'
# engine, an untagged test
cd engine && ./gradlew test --tests 'cz.morosystems.aml.engine.run.RuleAcceptanceGapTest.gap012_inactiveClientGetsA1Only'
# frontend
cd frontend && pnpm test -- src/app/App.gap.test.tsx -t "GAP-153"
```

Save the output to a log file in the scratchpad and read the tail; do not paste it into the ledger.

Then, in the ledger:

- the assertion fails and the test is quarantined: status `RED`;
- the assertion passes and the test is kept: status `GREEN`;
- the test cannot be written or run (missing fixture, no Postgres, blocked API): status `BLOCKED`, no test file left behind;
- the path column gets the real test path and test name;
- append one line to the Findings section: `GAP-nnn · RED|GREEN|BLOCKED · 2026-10-20 · <what the test showed, one sentence> · <path>`.

Then run the repo's gates on the files you touched: `./gradlew test` in `engine/` must stay green (the quarantined test is excluded), `pnpm check` in `frontend/` must stay green. If a gate goes red because of the new test, fix the quarantine, not the behaviour.

## 5. Browser rows

A row with layer `browser` has no test file.

1. Start the engine and the dev server through the `devserver` skill (`dev.sh`), which runs them in titled Orca terminals; wait until both answer.
2. Dispatch the `browser-validator` agent with **one claim per assertion**, taken from the row's `expected` cell: the URL to open, the user to sign in as (the avatar menu switches between the seeded reviewer and manager), the exact actions, and the exact text or element to assert. Give it the row id and nothing from other rows.
3. Record its verdict per assertion in Findings and set the row: every assertion holds `GREEN`; any refuted `RED`; the agent could not reach the state (no flagged case, no Bedrock reply, no rejected result to show) `BLOCKED` with the reason.
4. Leave the servers running for the next browser row; stop them through `dev.sh` when the loop stops.

A browser row that needs seeded state (GAP-183's rejected `ai_result` row) says so in its `expected` cell: seed it with `psql` against the local engine database before dispatching, and say in Findings what was inserted.

## 6. Web search

Search the web only where a local doc points outward: whether a country is on the July 2026 EU or FATF high-risk lists (`docs/challenge/rule-b-reference-data.md`, GAP-039), or what "the ČNB fixing valid on the day" means for a weekend or a day before publication (Act §54(3) as cited in `mentor-questions.md`, GAP-016, GAP-020). Cite the page in Findings. An external source that disagrees with a local doc **adds a QUESTION row** at the end of the area, stating both readings; it never turns a passing test RED and never changes an expected value on its own.

## 7. What the loop never does

- Never changes behaviour under test: no edits to `engine/src/main`, `frontend/src` outside test files, migrations, `triage-config-v1.json` or the reference list. Find, don't fix.
- Never commits and never pushes. The worktree's diff is reviewed by a person after the loop stops.
- Never calls Bedrock from a test; engine tests that need a model reply use `FakeBedrock` as `AssessmentControllerTest` does.
- Never puts anything from `data/raw` into a test, the ledger or Findings.
- Never resolves a QUESTION row: it records what is open and moves on.
- Never deletes or renumbers a ledger row.

## Tick report

End each tick with the row id, its new status, the test path, and the one-line finding. Every fifth tick, add the counts per status.
