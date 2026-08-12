-- Semilla para la prueba de sincronización. Reproduce lo que el usuario
-- haría en Supabase: crear las cuentas y dar de alta las cuadrillas.

-- Permisos del rol sin privilegios con el que corre el servidor de prueba;
-- en Supabase equivale al rol `authenticated`.
grant usage on schema public, auth, storage to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant execute on all functions in schema public to app_user;

-- Cuentas
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001','paul@gammatree.com',    '{"full_name":"Paul G."}'),
  ('a0000000-0000-0000-0000-000000000002','eliseo@gammatree.com',  '{"full_name":"Eliseo Marín"}'),
  ('a0000000-0000-0000-0000-000000000003','ivan@gammatree.com',    '{"full_name":"Ivan Delgado"}');

update profiles set role = 'admin' where email = 'paul@gammatree.com';

-- Cuadrillas: el trigger las enlaza con su líder por el correo.
insert into groups (name, leader_name, leader_email, equipment_type, member_count) values
  ('Eliseo''s Crew','Eliseo Marín','eliseo@gammatree.com','climbing',4),
  ('Ivan''s Crew',  'Ivan Delgado','ivan@gammatree.com',  'bucket',  5);

insert into group_skills (group_id, skill)
select id, unnest(array['trimming','aerial','storm']::job_kind[]) from groups where name like 'Eliseo%';
insert into group_skills (group_id, skill)
select id, unnest(array['removal','brush']::job_kind[]) from groups where name like 'Ivan%';

-- Órdenes de arranque, una por cuadrilla.
insert into work_orders (address, scheduled_date, job_types, equipment_required, instructions, state, group_id)
select '22 Fossil Ridge Dr, Swansea, IL', current_date, array['trimming']::job_kind[], 'climbing',
       'High canopy pruning near the line.', 'assigned', id
from groups where name like 'Eliseo%';

insert into work_orders (address, scheduled_date, job_types, equipment_required, instructions, state, group_id)
select '412 Frank Scott Pkwy, Belleville, IL', current_date, array['removal']::job_kind[], 'bucket',
       'Remove dead oak next to the garage.', 'assigned', id
from groups where name like 'Ivan%';
