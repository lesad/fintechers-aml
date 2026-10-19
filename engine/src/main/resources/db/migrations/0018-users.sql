--liquibase formatted sql

--changeset jan.bartl:25
-- The people who work the queue; there is no login yet, the UI picks one. `user` is a reserved word.
create table app_user (
    id bigserial primary key,
    name text not null,
    role text not null check (role in ('REVIEWER', 'MANAGER'))
);
insert into app_user (name, role) values ('J. Novák', 'REVIEWER'), ('M. Svobodová', 'MANAGER');

-- Who last set an alert's status.
alter table alert add column status_by bigint references app_user;
--rollback alter table alert drop column status_by; drop table app_user;
