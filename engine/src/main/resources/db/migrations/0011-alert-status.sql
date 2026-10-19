--liquibase formatted sql

--changeset jan.bartl:21
-- Where a reviewer's case stands. Every alert starts NEW; a reviewer escalates it or marks it a false
-- positive, and an escalated case ends REPORTED once it goes to the FAÚ.
alter table alert add column status text not null default 'NEW'
    check (status in ('NEW', 'ESCALATED', 'FALSE_POSITIVE', 'REPORTED'));
--rollback alter table alert drop column status;
