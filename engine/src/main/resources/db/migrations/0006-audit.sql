--liquibase formatted sql

--changeset adrian.lestinsky:16
create table audit_entry (
    id bigserial primary key,
    alert_id bigint not null references alert on delete cascade,
    at timestamptz not null default now(),
    actor text not null,
    step text not null,
    result text not null,
    inputs jsonb,
    reason text
);
create index audit_entry_alert_idx on audit_entry (alert_id, id);
--rollback drop table audit_entry;
