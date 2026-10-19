# Monitoring rules engine

Kotlin + Spring Boot service that imports the organisers' data and runs the monitoring rules. Driven by CLI commands, no REST.

## Prerequisites

- JDK 25 is fetched by the Gradle toolchain; Docker is needed for the tests (Testcontainers).
- `docker compose -f engine/compose.yaml up -d --wait` from the repo root starts the local Postgres on port 5440 (`ENGINE_DB_PORT` changes it; override the connection with `ENGINE_DB_URL`, `ENGINE_DB_USER`, `ENGINE_DB_PASSWORD`).
- `pnpm data:pull` fills `data/raw/`.

## Commands

Run from `engine/`:

```sh
./gradlew bootRun --args=import   # load the raw data into Postgres
./gradlew bootRun --args=run      # run the rules; output goes to data/out/
./gradlew test                    # tests use a throwaway Postgres container, never the dev database
```

Schema changes are Liquibase SQL files in `src/main/resources/db/migrations/`, listed in `db/changelog-master.xml`.
