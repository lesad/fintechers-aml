--liquibase formatted sql

--changeset adrian.lestinsky:23
create table ai_result (
    id bigserial primary key,
    alert_id bigint not null references alert on delete cascade,
    kind text not null check (kind in ('summary', 'assessment')),
    status text not null check (status in ('ready', 'rejected', 'failed')),
    body jsonb,
    error text,
    model_id text not null,
    prompt_hash text not null,
    input_hash text not null,
    created_at timestamptz not null default now(),
    check ((status = 'ready') = (body is not null))
);
create index ai_result_alert_idx on ai_result (alert_id, kind, id);
insert into ai_result (alert_id, kind, status, body, model_id, prompt_hash, input_hash, created_at)
select alert_id, 'summary', 'ready', jsonb_build_object('sentences', sentences), model_id, prompt_hash, 'unknown', created_at
from alert_summary order by id;
--rollback drop table ai_result;

--changeset adrian.lestinsky:24
drop table alert_summary;
--rollback create table alert_summary (id bigserial primary key, alert_id bigint not null references alert on delete cascade, text text not null, sentences jsonb not null, model_id text not null, prompt_hash text not null, created_at timestamptz not null default now());
--rollback create index alert_summary_alert_idx on alert_summary (alert_id, id);
