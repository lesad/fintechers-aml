--liquibase formatted sql

--changeset andrej.culen:22
-- Money becomes CZK as a double, the unit the source CSV already uses; haléře are gone from the whole app.
alter table client
    alter column expected_monthly_volume type double precision using expected_monthly_volume / 100.0,
    alter column q2_volume type double precision using q2_volume / 100.0,
    alter column q2_max_tx type double precision using q2_max_tx / 100.0;
alter table transaction alter column amount type double precision using amount / 100.0;
--rollback alter table transaction alter column amount type bigint using round(amount * 100);
--rollback alter table client alter column expected_monthly_volume type bigint using round(expected_monthly_volume * 100), alter column q2_volume type bigint using round(q2_volume * 100), alter column q2_max_tx type bigint using round(q2_max_tx * 100);

--changeset andrej.culen:23
-- A parameter is a double too, and `unit` (0014) says which ones are money: an amount becomes CZK, a
-- percentage, a multiple and a count keep their number.
alter table rule_param alter column value type double precision using value;
update rule_param set value = value / 100 where unit = 'amount';
--rollback update rule_param set value = value * 100 where unit = 'amount';
--rollback alter table rule_param alter column value type bigint using round(value);

--changeset andrej.culen:24
-- Same rules, same thresholds, new unit: CEL has no mixed int/double arithmetic, so a literal that multiplies an
-- amount is a double literal, and a count that multiplies one is converted. Matched on the exact condition, so a
-- rule version written by hand since is left alone.
update rule set condition = 'day_volume * 100.0 > p.projected_pct * client.expected_monthly_volume'
where condition = 'day_volume * 100 > p.projected_pct * client.expected_monthly_volume';
update rule set condition = 'client.q2_tx_count > 0 && day_volume * double(client.q2_days) > p.avg_multiple * client.q2_volume'
where condition = 'client.q2_tx_count > 0 && day_volume * client.q2_days > p.avg_multiple * client.q2_volume';
update rule set condition = 'inflow > p.min_inflow && outflow * 100.0 >= p.forward_pct * inflow'
where condition = 'inflow > p.min_inflow && outflow * 100 >= p.forward_pct * inflow';
--rollback update rule set condition = 'day_volume * 100 > p.projected_pct * client.expected_monthly_volume' where condition = 'day_volume * 100.0 > p.projected_pct * client.expected_monthly_volume';
--rollback update rule set condition = 'client.q2_tx_count > 0 && day_volume * client.q2_days > p.avg_multiple * client.q2_volume' where condition = 'client.q2_tx_count > 0 && day_volume * double(client.q2_days) > p.avg_multiple * client.q2_volume';
--rollback update rule set condition = 'inflow > p.min_inflow && outflow * 100 >= p.forward_pct * inflow' where condition = 'inflow > p.min_inflow && outflow * 100.0 >= p.forward_pct * inflow';
