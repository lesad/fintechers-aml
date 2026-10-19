--liquibase formatted sql

--changeset martin.dulak:1
create table client (
    id text primary key,
    country text,
    contract_date date,
    channel text,
    pep boolean,
    type text,
    expected_monthly_volume bigint,
    expected_count int,
    q2_volume bigint,
    q2_tx_count int,
    q2_max_tx bigint,
    q2_days int,
    risk text
);
--rollback drop table client;

--changeset martin.dulak:2
create table transaction (
    id text primary key,
    client_id text not null references client,
    ts timestamp not null,
    amount bigint not null,
    volume numeric(18, 2) not null,
    currency text not null,
    fx_rate numeric(18, 6) not null,
    payer_country text,
    payee_country text,
    payer_account text,
    payee_account text,
    type text not null,
    direction text not null check (direction in ('in', 'out', 'unknown'))
);
create index transaction_client_ts_idx on transaction (client_id, ts);
--rollback drop table transaction;

--changeset martin.dulak:3
create table fx_rate (
    date date,
    currency text,
    quantity int,
    rate numeric(18, 6),
    primary key (date, currency)
);
--rollback drop table fx_rate;

--changeset martin.dulak:4
create table reference_list (
    list text,
    code text,
    valid_for text,
    source text,
    primary key (list, code)
);
--rollback drop table reference_list;
