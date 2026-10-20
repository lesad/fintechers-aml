--liquibase formatted sql

--changeset martin.dulak:30
-- Why a rule version was proposed (ADR-0053); required for every new version, null on those saved before.
alter table rule add column change_reason text;
--rollback alter table rule drop column change_reason;
