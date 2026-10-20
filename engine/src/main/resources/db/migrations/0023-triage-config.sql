--liquibase formatted sql

--changeset andrej.culen:25
-- The triage policy, versioned exactly like `rule`: insert-only, never edited, never deleted. A change is a new
-- version, so a decision stays explicable under the config it was taken with. Only a status transition ever UPDATEs.
--
-- The policy is stored as real columns and child tables rather than one document, because the editor that reads it
-- edits one band or one score at a time: a single field is a single row, two editors do not clobber each other, the
-- ordering invariants are SQL constraints rather than Kotlin-only requires, and diffing two versions is a join.
--
-- Every child row hangs off the config *version* (`config_id`), not off a rule key — the same lesson 0012 applied to
-- `rule_param`. Nothing is ever deleted, so no `on delete` clause is needed anywhere.
--
-- There is deliberately no foreign key from `triage_rule.rule_key` to `rule`: `rule` has no primary key on `key`
-- alone, and a retired config version must stay readable after the rule key it scored is gone.
--
-- `position` on the ordered children preserves the *authored* order, which is what the policy's list order means:
-- amount bands descend by threshold, score bands ascend, floors and required fields produce reason lines in order.
-- Reading them back in position order is what makes the decision reproducible.
--
-- High-risk countries get no table here: they are not triage policy but reference data, overlaid onto the config from
-- `reference_list` at decision time.
create table triage_config (
    id          bigserial primary key,
    version     int not null unique,
    status      text check (status in ('draft', 'approved', 'active', 'retired')),
    author      text,
    approver    text,
    created_at  timestamptz default now(),
    approved_at timestamptz,
    unknown_rule_score           int not null check (unknown_rule_score between 0 and 100),
    per_extra_rule               int not null check (per_extra_rule >= 0),
    extra_rule_max               int not null check (extra_rule_max >= 0),
    factor_pep                   int not null,
    factor_high_risk_country     int not null,
    factor_static_cap            int not null check (factor_static_cap >= 0),
    factor_unbaselined_client    int not null,
    factor_tenure_under_90_days  int not null,
    factor_tenure_under_365_days int not null,
    factor_per_extra_alert_type  int not null,
    factor_extra_alert_type_max  int not null
);
create unique index triage_config_one_active on triage_config (status) where status = 'active';

create table triage_rule (
    config_id      bigint  not null references triage_config,
    rule_key       text    not null,
    base_score     int     not null check (base_score between 0 and 100),
    auto_closeable boolean not null default false,
    implies_pep    boolean not null default false,
    primary key (config_id, rule_key)
);

create table triage_risk_point (
    config_id bigint not null references triage_config,
    rating    text   not null,
    points    int    not null,
    primary key (config_id, rating)
);

create table triage_channel_point (
    config_id bigint not null references triage_config,
    channel   text   not null,
    points    int    not null,
    primary key (config_id, channel)
);

create table triage_amount_band (
    config_id   bigint           not null references triage_config,
    position    int              not null,
    from_amount double precision not null check (from_amount >= 0),
    points      int              not null,
    primary key (config_id, position)
);

create table triage_intensity_band (
    config_id  bigint not null references triage_config,
    alert_type text   not null,
    position   int    not null,
    from_hits  int    not null,
    points     int    not null,
    primary key (config_id, alert_type, position)
);

create table triage_band (
    config_id   bigint not null references triage_config,
    position    int    not null,
    max_score   int    not null check (max_score between 0 and 100),
    disposition text   not null check (disposition in ('AUTO_CLOSE', 'REVIEW_LOW', 'REVIEW_MEDIUM', 'REVIEW_HIGH', 'ESCALATE')),
    primary key (config_id, position)
);

create table triage_required_field (
    config_id bigint not null references triage_config,
    position  int    not null,
    field     text   not null check (field in ('client.risk', 'client.country', 'client.expected_monthly_volume', 'alert.amount')),
    primary key (config_id, position),
    unique (config_id, field)
);

-- The last check is the SQL twin of `TriageConfig`'s init require: an alert type belongs to an ALERT_TYPE floor and
-- to no other condition.
create table triage_floor (
    config_id       bigint not null references triage_config,
    position        int    not null,
    condition       text   not null check (condition in ('UNKNOWN_RULE', 'PEP_AND_HIGH_RISK_COUNTRY', 'ALERT_TYPE', 'CLIENT_UNBASELINED')),
    alert_type      text,
    min_disposition text   not null check (min_disposition in ('AUTO_CLOSE', 'REVIEW_LOW', 'REVIEW_MEDIUM', 'REVIEW_HIGH', 'ESCALATE')),
    primary key (config_id, position),
    check ((condition = 'ALERT_TYPE') = (alert_type is not null))
);

-- Version 1 is the config the engine used to carry on its classpath, value for value.
insert into triage_config (
    version, status, author,
    unknown_rule_score, per_extra_rule, extra_rule_max,
    factor_pep, factor_high_risk_country, factor_static_cap, factor_unbaselined_client,
    factor_tenure_under_90_days, factor_tenure_under_365_days, factor_per_extra_alert_type, factor_extra_alert_type_max
) values (1, 'active', 'finreg-brief', 70, 3, 6, 15, 10, 25, 10, 10, 5, 10, 20);

insert into triage_rule (config_id, rule_key, base_score, auto_closeable, implies_pep)
select c.id, s.rule_key, s.base_score, s.auto_closeable, s.implies_pep
from triage_config c, (values
    ('A1',  8, true,  false),
    ('A2',  8, true,  false),
    ('A3', 12, true,  false),
    ('B1', 40, false, false),
    ('B2', 35, false, true),
    ('C1', 45, false, false)
) as s(rule_key, base_score, auto_closeable, implies_pep)
where c.version = 1;

insert into triage_risk_point (config_id, rating, points)
select c.id, s.rating, s.points
from triage_config c, (values ('low', 0), ('medium', 10), ('high', 20)) as s(rating, points)
where c.version = 1;

insert into triage_channel_point (config_id, channel, points)
select c.id, s.channel, s.points
from triage_config c, (values ('in person', 0), ('distant form', 5)) as s(channel, points)
where c.version = 1;

insert into triage_amount_band (config_id, position, from_amount, points)
select c.id, s.position, s.from_amount, s.points
from triage_config c, (values (1, 1000000, 15), (2, 250000, 8), (3, 50000, 3)) as s(position, from_amount, points)
where c.version = 1;

insert into triage_intensity_band (config_id, alert_type, position, from_hits, points)
select c.id, s.alert_type, s.position, s.from_hits, s.points
from triage_config c, (values
    ('A', 1, 60, 10),
    ('A', 2, 45,  5),
    ('C', 1,  3, 10),
    ('C', 2,  2,  5)
) as s(alert_type, position, from_hits, points)
where c.version = 1;

insert into triage_band (config_id, position, max_score, disposition)
select c.id, s.position, s.max_score, s.disposition
from triage_config c, (values
    (1,  24, 'AUTO_CLOSE'),
    (2,  44, 'REVIEW_LOW'),
    (3,  64, 'REVIEW_MEDIUM'),
    (4,  84, 'REVIEW_HIGH'),
    (5, 100, 'ESCALATE')
) as s(position, max_score, disposition)
where c.version = 1;

insert into triage_required_field (config_id, position, field)
select c.id, s.position, s.field
from triage_config c, (values
    (1, 'client.risk'),
    (2, 'client.country'),
    (3, 'client.expected_monthly_volume'),
    (4, 'alert.amount')
) as s(position, field)
where c.version = 1;

insert into triage_floor (config_id, position, condition, alert_type, min_disposition)
select c.id, s.position, s.condition, s.alert_type, s.min_disposition
from triage_config c, (values
    (1, 'UNKNOWN_RULE',              null, 'REVIEW_HIGH'),
    (2, 'PEP_AND_HIGH_RISK_COUNTRY', null, 'REVIEW_HIGH'),
    (3, 'ALERT_TYPE',                'B',  'REVIEW_MEDIUM'),
    (4, 'ALERT_TYPE',                'C',  'REVIEW_MEDIUM'),
    (5, 'CLIENT_UNBASELINED',        null, 'REVIEW_LOW')
) as s(position, condition, alert_type, min_disposition)
where c.version = 1;
--rollback drop table triage_floor; drop table triage_required_field; drop table triage_band; drop table triage_intensity_band; drop table triage_amount_band; drop table triage_channel_point; drop table triage_risk_point; drop table triage_rule; drop table triage_config;
