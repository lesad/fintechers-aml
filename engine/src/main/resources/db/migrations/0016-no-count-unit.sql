--liquibase formatted sql

--changeset martin.dulak:24
alter table rule_param drop constraint rule_param_unit_check;
alter table rule_param add constraint rule_param_unit_check check (unit in ('amount', 'percent', 'multiple'));
--rollback alter table rule_param drop constraint rule_param_unit_check; alter table rule_param add constraint rule_param_unit_check check (unit in ('amount', 'percent', 'multiple', 'count'));
