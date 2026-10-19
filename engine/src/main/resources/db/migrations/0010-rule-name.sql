--liquibase formatted sql

--changeset jan.bartl:20
-- A human-readable name per rule, shown in the review UI next to the key. Nullable: a rule proposed later
-- may come without one, and the API falls back to the key.
alter table rule add column name text;

update rule set name = 'Daily volume above the projected share of expected monthly volume' where key = 'A1';
update rule set name = 'Daily volume above a multiple of the Q2 daily average' where key = 'A2';
update rule set name = 'Single transaction above a multiple of the Q2 maximum' where key = 'A3';
update rule set name = 'Transaction touching a high-risk country' where key = 'B1';
update rule set name = 'PEP outgoing payment above the limit' where key = 'B2';
update rule set name = 'Flow-through: inflow forwarded within hours' where key = 'C1';
--rollback alter table rule drop column name;
