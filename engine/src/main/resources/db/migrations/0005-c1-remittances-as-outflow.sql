--liquibase formatted sql

--changeset martin.dulak:15
insert into rule (key, version, alert_type, layer, grain, anchor, condition, status, author)
select key, 2, alert_type, layer, grain, anchor, condition, 'active', 'docs-rules'
from rule where key = 'C1' and version = 1;

insert into rule_variable (rule_id, position, name, agg, field, filter, window_kind, window_from, window_to)
select v2.id, v.position, v.name, v.agg, v.field,
    case when v.name = 'outflow'
        then 'tx.direction in ["out", "unknown"] && !(tx.payee_account in payers)'
        else v.filter end,
    v.window_kind, v.window_from, v.window_to
from rule_variable v
join rule v1 on v1.id = v.rule_id and v1.key = 'C1' and v1.version = 1
join rule v2 on v2.key = 'C1' and v2.version = 2;

update rule set status = 'retired' where key = 'C1' and version = 1;
--rollback delete from rule_variable where rule_id = (select id from rule where key = 'C1' and version = 2); delete from rule where key = 'C1' and version = 2; update rule set status = 'active' where key = 'C1' and version = 1;
