--liquibase formatted sql

--changeset martin.dulak:14
insert into rule (key, version, alert_type, layer, grain, anchor, condition, status, author) values
    ('A1', 1, 'A', 'company', 'client_day', null,
     'day_volume * 100 > p.projected_pct * client.expected_monthly_volume', 'active', 'finreg-brief'),
    ('A2', 1, 'A', 'company', 'client_day', null,
     'client.q2_tx_count > 0 && day_volume * client.q2_days > p.avg_multiple * client.q2_volume', 'active', 'finreg-brief'),
    ('A3', 1, 'A', 'company', 'transaction', null,
     'client.q2_tx_count > 0 && tx.amount > p.max_multiple * client.q2_max_tx', 'active', 'finreg-brief'),
    ('B1', 1, 'B', 'company', 'transaction', null,
     'tx.amount > p.country_min && (tx.payer_country in lists.high_risk || tx.payee_country in lists.high_risk || client.country in lists.high_risk)', 'active', 'finreg-brief'),
    ('B2', 1, 'B', 'company', 'transaction', null,
     'client.pep && tx.amount > p.pep_min && tx.direction in ["out", "unknown"]', 'active', 'finreg-brief'),
    ('C1', 1, 'C', 'company', 'client_anchor', 'tx.direction == "in"',
     'inflow > p.min_inflow && outflow * 100 >= p.forward_pct * inflow', 'active', 'finreg-brief');

insert into rule_variable (rule_id, position, name, agg, field, filter, window_kind, window_from, window_to)
select id, 1, 'day_volume', 'sum', 'amount', 'true', 'day', null, null
from rule where key in ('A1', 'A2') and version = 1;

insert into rule_variable (rule_id, position, name, agg, field, filter, window_kind, window_from, window_to)
select r.id, v.position, v.name, v.agg, v.field, v.filter, 'relative', v.window_from::interval, v.window_to::interval
from rule r,
    (values
        (1, 'inflow', 'sum', 'amount', 'tx.direction == "in"', '-24 hours', '0'),
        (2, 'payers', 'set', 'payer_account', 'tx.direction == "in"', '-24 hours', '0'),
        (3, 'outflow', 'sum', 'amount', 'tx.direction == "out" && !(tx.payee_account in payers)', '0', '6 hours')
    ) as v (position, name, agg, field, filter, window_from, window_to)
where r.id = (select id from rule where key = 'C1' and version = 1);

insert into rule_param (rule_key, name, layer, value) values
    ('A1', 'projected_pct', 'company', 25),
    ('A2', 'avg_multiple', 'company', 3),
    ('A3', 'max_multiple', 'company', 2),
    ('B1', 'country_min', 'company', 1000000),
    ('B2', 'pep_min', 'company', 10000000),
    ('C1', 'min_inflow', 'company', 10000000),
    ('C1', 'forward_pct', 'company', 80);
--rollback delete from rule_param; delete from rule_variable; delete from rule;
