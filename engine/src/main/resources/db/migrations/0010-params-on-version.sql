--liquibase formatted sql

--changeset martin.dulak:20 splitStatements:false
do $$ begin
    if exists (select 1 from rule_param where layer <> 'company') then
        raise exception 'rule_param has non-company rows; move them onto replacing rule versions first';
    end if;
end $$;
--rollback select 1;

--changeset martin.dulak:21
create table rule_param_v (
    rule_id bigint references rule,
    name text,
    value bigint not null,
    primary key (rule_id, name)
);
insert into rule_param_v (rule_id, name, value)
select r.id, p.name, p.value from rule_param p join rule r on r.key = p.rule_key;
drop table rule_param;
alter table rule_param_v rename to rule_param;
--rollback create table rule_param_old (id bigserial primary key, rule_key text, name text, layer text, scope_segment_id bigint, scope_client_id text, value bigint not null); insert into rule_param_old (rule_key, name, layer, value) select distinct on (r.key, p.name) r.key, p.name, 'company', p.value from rule_param p join rule r on r.id = p.rule_id order by r.key, p.name, r.version desc; drop table rule_param; alter table rule_param_old rename to rule_param;
