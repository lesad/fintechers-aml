--liquibase formatted sql

--changeset jan.bartl:27
-- A draft rule version's backtest (ADR-0049): the summary and every transaction it changed or kept flagged, kept
-- apart from the production runs and alerts. It runs in the background: `status` is RUNNING until the counts and
-- rows are in (DONE), or FAILED with the reason in `error`. Starting a backtest deletes every stored one.
create table backtest (
    id bigserial primary key,
    rule_id bigint not null unique references rule on delete cascade,
    rule_key text not null,
    rule_name text,
    draft_version int not null,
    active_version int,
    from_date date not null,
    to_date date not null,
    status text not null default 'RUNNING' check (status in ('RUNNING', 'DONE', 'FAILED')),
    error text,
    transactions int not null default 0,
    new_count int not null default 0,
    dropped_count int not null default 0,
    changed_count int not null default 0,
    unchanged_count int not null default 0,
    created_by bigint references app_user,
    created_at timestamptz not null default now()
);

create table backtest_row (
    backtest_id bigint not null references backtest on delete cascade,
    position int not null,
    transaction_id text not null,
    client_id text not null,
    amount double precision not null,
    ts timestamp not null,
    before_rating text check (before_rating in ('High', 'Medium', 'Low')),
    after_rating text check (after_rating in ('High', 'Medium', 'Low')),
    change text not null check (change in ('NEW', 'RAISED', 'LOWERED', 'DROPPED', 'UNCHANGED')),
    note text,
    primary key (backtest_id, position)
);
create index backtest_row_change on backtest_row (backtest_id, change, position);
--rollback drop table backtest_row; drop table backtest;

--changeset jan.bartl:28 splitStatements:false
-- Once a version is approved (or otherwise leaves draft and pending) its backtest has served and goes; a deleted
-- draft takes it along through the foreign key.
create function backtest_clean_up() returns trigger language plpgsql as $$
begin
    delete from backtest where rule_id = new.id;
    return new;
end
$$;

create trigger rule_backtest_clean_up after update of status on rule
    for each row when (new.status not in ('draft', 'pending'))
    execute function backtest_clean_up();
--rollback drop trigger rule_backtest_clean_up on rule; drop function backtest_clean_up();
