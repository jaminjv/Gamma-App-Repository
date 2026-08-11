-- ============================================================
-- RAMAJE — Datos de ejemplo (opcional)
-- Corre esto DESPUÉS de crear tus usuarios reales en Supabase Auth
-- (los líderes deben existir en auth.users / profiles antes de
-- poder ser asignados como leader_id). Si aún no tienes usuarios
-- creados, puedes correr solo la sección de "groups" comentando
-- el leader_id, y actualizarlo después.
-- ============================================================

-- Cuadrillas (ajusta los leader_id una vez tengas los UUID reales
-- de tus usuarios de Supabase Auth — ver README, sección
-- "Crear cuadrillas y líderes")
insert into groups (id, name, equipment_type, member_count) values
  (gen_random_uuid(), 'Eliseo''s Crew',  'climbing', 4),
  (gen_random_uuid(), 'Ivan''s Crew',    'bucket',   5),
  (gen_random_uuid(), 'Jose''s Crew',    'ambos',    6),
  (gen_random_uuid(), 'Baltazar''s Crew','bucket',   4),
  (gen_random_uuid(), 'Ron''s Crew',     'climbing', 3);

-- Habilidades por cuadrilla
insert into group_skills (group_id, job_type)
select id, unnest(array['poda_alta','trim','emergencia']::job_type[]) from groups where name = 'Eliseo''s Crew';
insert into group_skills (group_id, job_type)
select id, unnest(array['remocion','trim']::job_type[]) from groups where name = 'Ivan''s Crew';
insert into group_skills (group_id, job_type)
select id, unnest(array['remocion','poda_alta','emergencia','trim']::job_type[]) from groups where name = 'Jose''s Crew';
insert into group_skills (group_id, job_type)
select id, unnest(array['remocion','trim','emergencia']::job_type[]) from groups where name = 'Baltazar''s Crew';
insert into group_skills (group_id, job_type)
select id, unnest(array['poda_alta','trim']::job_type[]) from groups where name = 'Ron''s Crew';

-- Órdenes de trabajo de ejemplo
insert into work_orders (address, scheduled_date, job_type, equipment_required, instructions, status, group_id)
select '412 Frank Scott Pkwy, Belleville, IL', current_date, 'remocion', 'bucket',
       'Remove dead oak next to the garage. Client wants the wood stacked.', 'en_progreso', id
from groups where name = 'Ivan''s Crew';

insert into work_orders (address, scheduled_date, job_type, equipment_required, instructions, status, group_id)
select '22 Fossil Ridge Dr, Swansea, IL', current_date, 'poda_alta', 'climbing',
       'High canopy pruning, power line nearby — coordinate with Ameren.', 'asignado', id
from groups where name = 'Eliseo''s Crew';

insert into work_orders (address, scheduled_date, job_type, equipment_required, instructions, status, group_id)
values ('890 S Illinois St, Belleville, IL', current_date, 'trim', 'bucket',
        'Trim branches overhanging the roof.', 'pendiente', null);

insert into work_orders (address, scheduled_date, job_type, equipment_required, instructions, status, group_id, reassign_reason)
select '340 Longacre Dr, O''Fallon, IL', current_date, 'remocion', 'bucket',
       'Stump too close to gas line — flagged, needs a crew with utility clearance.', 'reasignar', id,
       'Stump too close to the gas line, needs a different crew.'
from groups where name = 'Baltazar''s Crew';

-- Reportes de vaciado de ejemplo
insert into dump_reports (group_id, location_name, dump_type, notes)
select id, 'Frank Scott Dump Site', 'chips', 'Partial load, brush + branches.'
from groups where name = 'Eliseo''s Crew';

insert into dump_reports (group_id, location_name, dump_type, notes)
select id, 'Belleville Rd Dump Site', 'logs', 'Full load, mostly trunk sections.'
from groups where name = 'Ivan''s Crew';
