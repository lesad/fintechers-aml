--liquibase formatted sql

--changeset martin.dulak:10
create table run (
    id bigserial primary key,
    kind text check (kind in ('production', 'backtest')),
    period_from timestamp,
    period_to timestamp,
    rule_ids bigint[],
    started_at timestamptz,
    finished_at timestamptz,
    report jsonb
);
--rollback drop table run;

--changeset martin.dulak:11
create table rule_hit (
    id bigserial primary key,
    run_id bigint references run,
    rule_id bigint references rule,
    client_id text,
    grain_key text,
    evidence jsonb
);
create index rule_hit_run_client_idx on rule_hit (run_id, client_id);
--rollback drop table rule_hit;

--changeset martin.dulak:12
create table alert (
    id bigserial primary key,
    run_id bigint references run,
    alert_type text,
    client_id text,
    transaction_id text,
    created_at timestamptz default now()
);
--rollback drop table alert;

--changeset martin.dulak:13
create table alert_hit (
    alert_id bigint references alert,
    hit_id bigint references rule_hit,
    primary key (alert_id, hit_id)
);
--rollback drop table alert_hit;
