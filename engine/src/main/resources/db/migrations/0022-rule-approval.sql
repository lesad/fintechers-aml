--liquibase formatted sql

--changeset martin.dulak:27
-- A draft sent for approval waits as `pending` with the manager it is assigned to; approving it makes it active.
alter table rule drop constraint rule_status_check;
alter table rule add constraint rule_status_check check (status in ('draft', 'pending', 'approved', 'active', 'retired'));
alter table rule add column assignee_id bigint references app_user;
-- Two approvals of the same key at once must not leave both versions active.
create unique index rule_one_active_per_key on rule (key) where status = 'active';
--rollback drop index rule_one_active_per_key; alter table rule drop column assignee_id; update rule set status = 'draft' where status = 'pending'; alter table rule drop constraint rule_status_check; alter table rule add constraint rule_status_check check (status in ('draft', 'approved', 'active', 'retired'));
