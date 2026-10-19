--liquibase formatted sql

--changeset martin.dulak:18
-- A table of its own, not columns on `alert`: a run can be re-triaged under a new config without touching the
-- detection output it was derived from.
create table alert_triage (
    alert_id bigint primary key references alert,
    disposition text not null check (disposition in ('AUTO_CLOSE','REVIEW_LOW','REVIEW_MEDIUM','REVIEW_HIGH','ESCALATE')),
    score int not null,
    reasons jsonb not null,
    config_version text not null,
    input_hash text not null,
    decided_at timestamptz default now()
);
--rollback drop table alert_triage;
