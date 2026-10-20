--liquibase formatted sql

--changeset jan.bartl:29
-- How many of the period's cases people closed as false positive in the current run, and how many of those the
-- draft no longer flags (ADR-0049): the false positives a rule change gets rid of.
alter table backtest
    add column false_positives int not null default 0,
    add column false_positives_cleared int not null default 0;
--rollback alter table backtest drop column false_positives, drop column false_positives_cleared;

--changeset jan.bartl:30
-- The backtest rows no longer carry a note; the change label says it.
alter table backtest_row drop column note;
--rollback alter table backtest_row add column note text;

--changeset jan.bartl:31
-- Why a backtest row changed, both may hold: by_rule when the rule itself is about the transaction, by_triage when
-- its alert also holds other transactions' hits, whose triage moved it; both false when unchanged.
alter table backtest_row
    add column by_rule boolean not null default false,
    add column by_triage boolean not null default false;
--rollback alter table backtest_row drop column by_rule, drop column by_triage;

--changeset jan.bartl:32
-- How many of the period's cases people reported in the current run, and how many of those the draft would let
-- through without an open alert: the false negatives a rule change would cause.
alter table backtest
    add column reported int not null default 0,
    add column false_negatives int not null default 0;
--rollback alter table backtest drop column reported, drop column false_negatives;
