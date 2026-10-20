--liquibase formatted sql

--changeset martin.dulak:29
-- Three roles as AMLR names them (ADR-0051): an analyst works the queue, the compliance officer decides escalated
-- cases, files reports and approves rules, the compliance manager (a board member) oversees and decides nothing.
alter table app_user drop constraint app_user_role_check;
update app_user set role = case role when 'REVIEWER' then 'ANALYST' when 'MANAGER' then 'COMPLIANCE_OFFICER' else role end;
alter table app_user add constraint app_user_role_check check (role in ('ANALYST', 'COMPLIANCE_OFFICER', 'COMPLIANCE_MANAGER'));
insert into app_user (name, role) values ('P. Dvořák', 'COMPLIANCE_MANAGER');
--rollback delete from app_user where role = 'COMPLIANCE_MANAGER'; alter table app_user drop constraint app_user_role_check; update app_user set role = case role when 'ANALYST' then 'REVIEWER' else 'MANAGER' end; alter table app_user add constraint app_user_role_check check (role in ('REVIEWER', 'MANAGER'));
