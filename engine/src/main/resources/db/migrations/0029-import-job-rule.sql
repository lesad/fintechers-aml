--liquibase formatted sql

--changeset jan.bartl:33
-- A rule version's approval recalculates the alerts in the background, as a job in the import history: it has no
-- file, and `rule` names the version that started it, e.g. "B2 v3".
alter table import_job
    alter column file_name drop not null,
    alter column file_size drop not null,
    add column rule text;
--rollback alter table import_job drop column rule; delete from import_job where file_name is null; alter table import_job alter column file_name set not null, alter column file_size set not null;
