--liquibase formatted sql

--changeset martin.dulak:26
-- Who works the case now. Triage routes it: an escalated case to the manager, any other to the reviewer.
alter table alert add column assignee_id bigint references app_user;

-- The decision log of a case (a transaction in a run): every routing, decision and reassignment, in order.
-- `actor_id` is null for a step the engine took on its own.
create table case_event (
    id bigserial primary key,
    run_id bigint not null references run on delete cascade,
    transaction_id text not null,
    at timestamptz not null default now(),
    actor_id bigint references app_user,
    action text not null check (action in ('ASSIGNED', 'REASSIGNED', 'NEW', 'ESCALATED', 'FALSE_POSITIVE', 'REPORTED')),
    reason text,
    assignee_id bigint references app_user
);
create index case_event_case on case_event (run_id, transaction_id);

-- Cases routed before this change catch up: assigned by their current status, logged as the engine's step.
update alert set assignee_id = (
    select min(id) from app_user
    where role = case when alert.status in ('ESCALATED', 'REPORTED') then 'MANAGER' else 'REVIEWER' end
)
where transaction_id is not null;

insert into case_event (run_id, transaction_id, at, action, assignee_id)
select run_id, transaction_id, min(created_at), 'ASSIGNED', min(assignee_id)
from alert where transaction_id is not null
group by run_id, transaction_id;
--rollback drop table case_event; alter table alert drop column assignee_id;
