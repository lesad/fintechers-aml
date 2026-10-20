--liquibase formatted sql

--changeset martin.dulak:28
-- On a report, whether the client's order is held under §20 (executed no earlier than 24 h after FAÚ receives the OPO).
alter table case_event add column if not exists postponed boolean;
--rollback alter table case_event drop column postponed;
