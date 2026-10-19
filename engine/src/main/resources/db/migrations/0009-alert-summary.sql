--liquibase formatted sql

--changeset adrian.lestinsky:19
create table alert_summary (
    id bigserial primary key,
    alert_id bigint not null references alert on delete cascade,
    text text not null,
    sentences jsonb not null,
    model_id text not null,
    prompt_hash text not null,
    created_at timestamptz not null default now()
);
create index alert_summary_alert_idx on alert_summary (alert_id, id);
--rollback drop table alert_summary;
