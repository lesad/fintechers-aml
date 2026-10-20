--liquibase formatted sql

--changeset andrej.culen:34
-- A triage config draft sent for approval waits as `pending` with the approver it is assigned to, exactly as a rule
-- version does (0022, ADR-0052): nobody activates a policy change they wrote themselves.
alter table triage_config drop constraint triage_config_status_check;
alter table triage_config add constraint triage_config_status_check check (status in ('draft', 'pending', 'approved', 'active', 'retired'));
alter table triage_config add column assignee_id bigint references app_user;
--rollback alter table triage_config drop column assignee_id; update triage_config set status = 'draft' where status = 'pending'; alter table triage_config drop constraint triage_config_status_check; alter table triage_config add constraint triage_config_status_check check (status in ('draft', 'approved', 'active', 'retired'));
