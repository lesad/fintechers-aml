--liquibase formatted sql

--changeset jan.bartl:26
-- Transaction files uploaded on the data import page: the history, and the progress of the one running.
-- `stage` moves VALIDATE → IMPORT → RUN → DONE, or ends FAILED with the reason in `note`.
create table import_job (
    id bigserial primary key,
    file_name text not null,
    file_size bigint not null,
    user_id bigint references app_user,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    stage text not null check (stage in ('VALIDATE', 'IMPORT', 'RUN', 'DONE', 'FAILED')),
    rows_total int,
    rows_imported int not null default 0,
    rows_rejected int not null default 0,
    alerts int,
    note text
);
--rollback drop table import_job;
