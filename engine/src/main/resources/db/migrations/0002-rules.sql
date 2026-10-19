--liquibase formatted sql

--changeset martin.dulak:5
create table alert_type (
    code text primary key,
    name text,
    unit text check (unit in ('client', 'transaction'))
);
insert into alert_type (code, name, unit) values
    ('A', 'A', 'client'),
    ('B', 'B', 'transaction'),
    ('C', 'C', 'client');
--rollback drop table alert_type;

--changeset martin.dulak:6
create table segment (
    id bigserial primary key,
    name text unique,
    predicate text not null
);
--rollback drop table segment;

--changeset martin.dulak:7
create table rule (
    id bigserial primary key,
    key text,
    version int,
    alert_type text references alert_type,
    layer text check (layer in ('company', 'segment', 'client')),
    scope_segment_id bigint references segment,
    scope_client_id text,
    grain text check (grain in ('transaction', 'client_day', 'client_anchor')),
    anchor text,
    condition text not null,
    replaces_key text,
    status text check (status in ('draft', 'approved', 'active', 'retired')),
    author text,
    approver text,
    created_at timestamptz default now(),
    approved_at timestamptz,
    unique (key, version)
);
--rollback drop table rule;

--changeset martin.dulak:8
create table rule_variable (
    rule_id bigint references rule,
    position int,
    name text,
    agg text check (agg in ('sum', 'max', 'min', 'count', 'set')),
    field text,
    filter text not null default 'true',
    window_kind text check (window_kind in ('day', 'relative')),
    window_from interval,
    window_to interval,
    primary key (rule_id, position)
);
--rollback drop table rule_variable;

--changeset martin.dulak:9
create table rule_param (
    id bigserial primary key,
    rule_key text,
    name text,
    layer text,
    scope_segment_id bigint,
    scope_client_id text,
    value bigint not null
);
--rollback drop table rule_param;
