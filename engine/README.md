# Monitoring rules engine

Kotlin + Spring Boot service that imports the organisers' data and runs the monitoring rules. Driven by CLI commands, no REST. Design: [`docs/engine/rules-engine-design.md`](../docs/engine/rules-engine-design.md).

## Prerequisites

- **Docker**, for the local Postgres and for the tests (Testcontainers).
- **Any JDK 17+** to start Gradle. The build itself runs on JDK 25, which the Gradle toolchain downloads on first use.
- **The data** in `data/raw/`: sign in with `aws sso login --profile hackathon`, then `pnpm data:pull` from the repo root (setup in the root [README](../README.md#getting-started-for-the-hackathon)). If your team profile has another name, run `bash scripts/pull-data.sh --profile <name>`.

## Run it locally

From the repo root:

```sh
docker compose -f engine/compose.yaml up -d --wait   # Postgres 17 on 127.0.0.1:5440
cd engine
./gradlew bootRun --args=import                       # ~15 s; migrates the schema, then loads data/raw/
```

The import prints a report. On the July 2026 data it reads:

```
ImportReport(clients=5493, transactions=397853, fxRates=6030, listCodes=31, clientsWithoutQ2=1, negativeVolumes=0, emptyRequiredFields=0)
```

It replaces the data on every run, so running it again is safe. It fails, and leaves the previous data in place, on a currency without a ČNB fixing, a transaction for an unknown client, or a duplicate ID.

Look at the result with `docker exec -it fintechers-aml-db-1 psql -U postgres` (tables `client`, `transaction`, `fx_rate`, `reference_list`; amounts are in haléře, CZK × 100).

Port 5440 avoids other projects' Postgres on 5432. To change it, set `ENGINE_DB_PORT` for compose and `ENGINE_DB_URL` (e.g. `jdbc:postgresql://127.0.0.1:5441/postgres`) for the engine; `ENGINE_DB_USER` and `ENGINE_DB_PASSWORD` default to `postgres`.

Stop the database with `docker compose -f engine/compose.yaml stop`; add `down -v` instead to delete its data.

## Commands

Run from `engine/`:

```sh
./gradlew bootRun --args=import   # load data/raw/ into Postgres
./gradlew bootRun --args=run      # run the rules into hits, alerts and data/out/alerts-<run>.csv
./gradlew test                    # tests use a throwaway Postgres container, never the dev database
./gradlew build                   # compile, test, package (what CI runs)
```

`./gradlew bootRun --args=run` runs every active rule over July 2026 (~30 s on the full data), stores hits and alerts, and writes `data/out/alerts-<run>.csv`. On the July data: A 5,493 alerts, B 112 (22 PEP clients), C 1,077 (remittances count as outflow, per `docs/rules/C-flow-through.md`; 720 without them).

Schema changes are Liquibase SQL files in `src/main/resources/db/migrations/`, listed in `db/changelog-master.xml`.

Rule CEL declares every field as a qualified name (`tx.amount`, `client.pep`, `p.min_inflow`) with a concrete type; the vocabulary is in `src/main/kotlin/.../cel/Vocabulary.kt`.

Variable filters are compiled to SQL with [cel2sql4j](https://github.com/SPANDigital/cel2sql4j) (`sql/Cel2SqlFilterCompiler.kt`). It does not accept qualified identifiers or dotted column aliases, so the filter sees `tx` as a map and earlier variables by bare column name; `RuleCompiler` type-checks the same filter against the full vocabulary.
