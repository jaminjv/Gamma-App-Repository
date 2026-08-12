-- ============================================================
-- GAMMA TREE EXPERTS — el esquema al día con las dos aplicaciones
--
-- Trae a la base todo lo que se construyó en los prototipos:
--   · varios tipos de trabajo por orden (antes era uno solo)
--   · retiro de cable eléctrico (drop wire)
--   · fecha de apertura inmutable, separada de la fecha programada
--   · varias fotos por orden
--   · requerimientos del campo (cuerdas, herramienta dañada, EPP…)
--   · consolidados de vaciados por día y por mes
--
-- Correr DESPUÉS de 0001 y 0003. Es idempotente en lo que se puede.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Vocabulario nuevo
--
-- Se crean tipos nuevos en vez de ampliar los viejos con
-- `alter type ... add value`: ese comando no permite usar el valor
-- recién añadido dentro de la misma transacción, así que una migración
-- que lo añade y acto seguido lo usa falla a mitad de camino.
-- ------------------------------------------------------------
do $$ begin
  create type job_kind as enum (
    'removal','trimming','stump','storm','catchlogs','brush',
    'aerial','crane','utility'
  );
exception when duplicate_object then null; end $$;

-- Los estados pasan a inglés para calzar uno a uno con las aplicaciones;
-- así se elimina una capa de traducción y los errores que trae.
do $$ begin
  create type order_state as enum ('pending','assigned','progress','done','flag');
exception when duplicate_object then null; end $$;

do $$ begin
  create type request_category as enum ('rope','tool','ppe','fuel','parts','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type request_urgency as enum ('low','normal','urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type request_state as enum ('new','ordered','resolved');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2. Órdenes de trabajo
-- ------------------------------------------------------------
alter table work_orders
  add column if not exists job_types  job_kind[] not null default '{}',
  add column if not exists drop_wire  boolean    not null default false,
  add column if not exists state      order_state;

comment on column work_orders.created_at is
  'Fecha de apertura de la orden. La fija la base y no se puede editar (ver trigger work_orders_freeze_created_at).';
comment on column work_orders.scheduled_date is
  'Fecha en que se hará el trabajo. Esta sí se reprograma.';
comment on column work_orders.drop_wire is
  'Requiere retiro de cable eléctrico; la app lo marca con un rayo.';

-- Traspaso del tipo único al arreglo, y del estado en español al inglés.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name='work_orders' and column_name='job_type') then
    update work_orders set job_types = array[
      case job_type::text
        when 'remocion'  then 'removal'
        when 'trim'      then 'trimming'
        when 'poda_alta' then 'aerial'
        when 'emergencia' then 'storm'
      end::job_kind]
    where cardinality(job_types) = 0;
    alter table work_orders drop column job_type;
  end if;

  if exists (select 1 from information_schema.columns
             where table_name='work_orders' and column_name='status') then
    update work_orders set state = case status::text
      when 'pendiente'   then 'pending'
      when 'asignado'    then 'assigned'
      when 'en_progreso' then 'progress'
      when 'hecho'       then 'done'
      when 'reasignar'   then 'flag'
    end::order_state
    where state is null;
    alter table work_orders drop column status;
  end if;
end $$;

alter table work_orders alter column state set default 'pending';
alter table work_orders alter column state set not null;

create index if not exists idx_work_orders_state on work_orders(state);
create index if not exists idx_work_orders_jobs  on work_orders using gin(job_types);

-- La fecha de apertura es inmutable: el requisito dice que se asigna sola y
-- no se modifica, y el único lugar donde eso se puede garantizar es aquí.
create or replace function public.freeze_created_at()
returns trigger language plpgsql as $$
begin
  if new.created_at is distinct from old.created_at then
    raise exception 'La fecha de apertura de una orden no se puede modificar';
  end if;
  return new;
end;
$$;
drop trigger if exists work_orders_freeze_created_at on work_orders;
create trigger work_orders_freeze_created_at
  before update on work_orders
  for each row execute procedure public.freeze_created_at();

-- ------------------------------------------------------------
-- 3. Fotos de la orden (varias por orden, además del boceto)
-- ------------------------------------------------------------
create table if not exists work_order_photos (
  id            uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  url           text not null,
  uploaded_by   uuid references profiles(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_wo_photos on work_order_photos(work_order_id);

-- ------------------------------------------------------------
-- 4. Requerimientos del campo
-- ------------------------------------------------------------
create table if not exists equipment_requests (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id) on delete cascade,
  created_by  uuid references profiles(id),
  category    request_category not null,
  urgency     request_urgency  not null default 'normal',
  note        text not null,
  note_lang   text not null default 'es',   -- el campo escribe en español
  photo_url   text,
  state       request_state not null default 'new',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_requests_group on equipment_requests(group_id);
create index if not exists idx_requests_state on equipment_requests(state);

comment on column equipment_requests.note_lang is
  'Idioma en que lo escribió el líder. El panel traduce a inglés sin tocar el original.';

-- Marca la hora de resolución sola, para no depender del cliente.
create or replace function public.stamp_resolved_at()
returns trigger language plpgsql as $$
begin
  if new.state = 'resolved' and old.state is distinct from 'resolved' then
    new.resolved_at := now();
  elsif new.state <> 'resolved' then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists requests_stamp_resolved on equipment_requests;
create trigger requests_stamp_resolved
  before update on equipment_requests
  for each row execute procedure public.stamp_resolved_at();

-- ------------------------------------------------------------
-- 5. Habilidades de cuadrilla con el vocabulario nuevo
-- ------------------------------------------------------------
alter table group_skills add column if not exists skill job_kind;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name='group_skills' and column_name='job_type') then
    update group_skills set skill = case job_type::text
      when 'remocion'   then 'removal'
      when 'trim'       then 'trimming'
      when 'poda_alta'  then 'aerial'
      when 'emergencia' then 'storm'
    end::job_kind
    where skill is null;
    alter table group_skills drop constraint if exists group_skills_group_id_job_type_key;
    alter table group_skills drop column job_type;
  end if;
end $$;

alter table group_skills alter column skill set not null;
do $$ begin
  alter table group_skills add constraint group_skills_unique unique (group_id, skill);
exception when duplicate_table or duplicate_object then null; end $$;

-- Ya nadie usa el tipo viejo.
drop type if exists job_type;
drop type if exists order_status;

-- ------------------------------------------------------------
-- 6. Consolidados de vaciados
--    Se resuelven en la base y no en el cliente: así el panel, la app y
--    cualquier reporte futuro cuentan exactamente lo mismo.
-- ------------------------------------------------------------
create or replace view dump_totals_daily as
select
  (reported_at at time zone 'America/Chicago')::date as day,
  group_id,
  count(*)                                            as loads,
  count(*) filter (where dump_type = 'chips')         as chips,
  count(*) filter (where dump_type = 'logs')          as logs
from dump_reports
group by 1, 2;

create or replace view dump_totals_monthly as
select
  date_trunc('month', reported_at at time zone 'America/Chicago')::date as month_start,
  (date_trunc('month', reported_at at time zone 'America/Chicago')
     + interval '1 month - 1 day')::date                                as month_end,
  group_id,
  count(*)                                            as loads,
  count(*) filter (where dump_type = 'chips')         as chips,
  count(*) filter (where dump_type = 'logs')          as logs
from dump_reports
group by 1, 2, 3;

comment on view dump_totals_daily is
  'Vaciados por día y cuadrilla. La zona horaria es la de la operación, no UTC: si no, las cargas de la tarde caen en el día siguiente.';

-- ------------------------------------------------------------
-- 7. RLS de lo nuevo
-- ------------------------------------------------------------
alter table work_order_photos  enable row level security;
alter table equipment_requests enable row level security;

drop policy if exists "wo_photos: admin acceso total" on work_order_photos;
create policy "wo_photos: admin acceso total" on work_order_photos
  for all using (is_admin()) with check (is_admin());

drop policy if exists "wo_photos: el líder ve las de sus órdenes" on work_order_photos;
create policy "wo_photos: el líder ve las de sus órdenes" on work_order_photos
  for select using (exists (
    select 1 from work_orders w
    where w.id = work_order_id and leads_group(w.group_id)
  ));

drop policy if exists "requests: admin acceso total" on equipment_requests;
create policy "requests: admin acceso total" on equipment_requests
  for all using (is_admin()) with check (is_admin());

drop policy if exists "requests: el líder ve los de su cuadrilla" on equipment_requests;
create policy "requests: el líder ve los de su cuadrilla" on equipment_requests
  for select using (leads_group(group_id));

-- El líder crea requerimientos para su cuadrilla, pero no decide su estado:
-- eso es de la oficina.
drop policy if exists "requests: el líder crea para su cuadrilla" on equipment_requests;
create policy "requests: el líder crea para su cuadrilla" on equipment_requests
  for insert with check (leads_group(group_id) and state = 'new');

-- ============================================================
-- Fin. Siguiente paso: apuntar las aplicaciones a este esquema.
-- ============================================================
