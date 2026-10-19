--liquibase formatted sql

--changeset adrian.lestinsky:17
drop table audit_entry;
--rollback select 1;
