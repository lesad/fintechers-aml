--liquibase formatted sql

--changeset martin.dulak:23
alter table rule_param add column unit text check (unit in ('amount', 'percent', 'multiple', 'count'));
update rule_param set unit = case
    when name in ('country_min', 'pep_min', 'min_inflow') then 'amount'
    when name in ('projected_pct', 'forward_pct') then 'percent'
    when name in ('avg_multiple', 'max_multiple') then 'multiple'
end;
alter table rule_param alter column unit set not null;
--rollback alter table rule_param drop column unit;
