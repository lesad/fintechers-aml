--liquibase formatted sql

--changeset martin.dulak:22
alter table rule
    add column explanation text,
    add column explanation_model text,
    add column explanation_prompt_hash text;
--rollback alter table rule drop column explanation, drop column explanation_model, drop column explanation_prompt_hash;
