--liquibase formatted sql

--changeset jan.bartl:24
-- Triage now moves an alert it decides ESCALATE from NEW to ESCALATED, so it goes straight to the manager.
-- Alerts triaged before that change catch up here; a status a person set stays.
update alert a set status = 'ESCALATED'
from alert_triage t
where t.alert_id = a.id and t.disposition = 'ESCALATE' and a.status = 'NEW';
--rollback select 1;
