-- ============================================================
-- RAMAJE — Esquema inicial de base de datos (Supabase / Postgres)
-- Corresponde a la Fase 1-2 del documento de especificación.
-- Pega este archivo completo en el SQL Editor de Supabase,
-- o córrelo con: supabase db push (si usas el CLI).
-- ============================================================

-- Extensión para generar UUIDs
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. Tipos (enums)
-- ------------------------------------------------------------
create type user_role as enum ('admin', 'group_leader');
create type equipment_type as enum ('bucket', 'climbing', 'ambos');
create type job_type as enum ('remocion', 'trim', 'poda_alta', 'emergencia');
create type order_status as enum ('pendiente', 'asignado', 'en_progreso', 'hecho', 'reasignar');
create type dump_type as enum ('chips', 'logs');

-- ------------------------------------------------------------
-- 2. Perfiles de usuario (extiende auth.users de Supabase Auth)
-- ------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role        user_role not null default 'group_leader',
  phone       text,
  created_at  timestamptz not null default now()
);

-- Crea automáticamente un perfil cuando alguien se registra en Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'group_leader');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 3. Cuadrillas
-- ------------------------------------------------------------
create table groups (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  leader_id       uuid references profiles(id),
  equipment_type  equipment_type not null,
  member_count    int not null default 1,
  created_at      timestamptz not null default now()
);

create table group_members (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references groups(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  role_in_group text default 'member',
  unique (group_id, user_id)
);

create table group_skills (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references groups(id) on delete cascade,
  job_type  job_type not null,
  unique (group_id, job_type)
);

-- ------------------------------------------------------------
-- 4. Órdenes de trabajo
-- ------------------------------------------------------------
create table work_orders (
  id                    uuid primary key default gen_random_uuid(),
  address               text not null,
  lat                   double precision,
  lng                   double precision,
  scheduled_date        date not null,
  job_type              job_type not null,
  equipment_required    equipment_type not null,
  instructions          text,
  sketch_image_url      text,           -- boceto/diagrama subido por el admin
  status                order_status not null default 'pendiente',
  reassign_reason       text,           -- motivo cuando el líder marca "reasignar"
  completion_photo_url  text,           -- foto subida por el líder al terminar
  group_id              uuid references groups(id),
  created_by            uuid references profiles(id),
  created_at            timestamptz not null default now(),
  started_at            timestamptz,
  completed_at          timestamptz
);

create index idx_work_orders_group on work_orders(group_id);
create index idx_work_orders_date on work_orders(scheduled_date);
create index idx_work_orders_status on work_orders(status);

-- ------------------------------------------------------------
-- 5. Reportes de vaciado
-- ------------------------------------------------------------
create table dump_reports (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid references groups(id),
  work_order_id  uuid references work_orders(id),
  location_name  text not null,
  dump_type      dump_type not null,
  lat            double precision,
  lng            double precision,
  reported_at    timestamptz not null default now(),
  notes          text,
  photo_url      text
);

create index idx_dump_reports_group on dump_reports(group_id);

-- ------------------------------------------------------------
-- 6. Jornadas (shifts) y rastreo GPS
-- ------------------------------------------------------------
create table shifts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id),
  shift_date  date not null default current_date,
  start_time  timestamptz,
  end_time    timestamptz,
  start_lat   double precision,
  start_lng   double precision,
  end_lat     double precision,
  end_lng     double precision
);

create table location_pings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references profiles(id),
  shift_id     uuid references shifts(id) on delete cascade,
  lat          double precision not null,
  lng          double precision not null,
  recorded_at  timestamptz not null default now()
);

create index idx_pings_shift on location_pings(shift_id);

-- ============================================================
-- 7. Row Level Security (RLS)
-- ============================================================

alter table profiles        enable row level security;
alter table groups          enable row level security;
alter table group_members   enable row level security;
alter table group_skills    enable row level security;
alter table work_orders     enable row level security;
alter table dump_reports    enable row level security;
alter table shifts          enable row level security;
alter table location_pings  enable row level security;

-- Función auxiliar: ¿el usuario actual es admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Función auxiliar: ¿el usuario actual lidera este grupo?
create or replace function public.leads_group(g_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from groups where id = g_id and leader_id = auth.uid()
  );
$$;

-- ---- profiles ----
create policy "profiles: ver el propio perfil" on profiles
  for select using (id = auth.uid() or is_admin());
create policy "profiles: admin actualiza cualquiera" on profiles
  for update using (is_admin());
create policy "profiles: el usuario actualiza su propio perfil" on profiles
  for update using (id = auth.uid());

-- ---- groups ----
create policy "groups: admin acceso total" on groups
  for all using (is_admin()) with check (is_admin());
create policy "groups: el líder ve su cuadrilla" on groups
  for select using (leader_id = auth.uid());

-- ---- group_members / group_skills ----
create policy "group_members: admin acceso total" on group_members
  for all using (is_admin()) with check (is_admin());
create policy "group_members: el líder ve su cuadrilla" on group_members
  for select using (leads_group(group_id));

create policy "group_skills: admin acceso total" on group_skills
  for all using (is_admin()) with check (is_admin());
create policy "group_skills: el líder ve su cuadrilla" on group_skills
  for select using (leads_group(group_id));

-- ---- work_orders ----
create policy "work_orders: admin acceso total" on work_orders
  for all using (is_admin()) with check (is_admin());
create policy "work_orders: el líder ve las de su cuadrilla" on work_orders
  for select using (leads_group(group_id));
-- El líder solo puede actualizar el estado/foto/motivo de SUS propias órdenes
-- (la app cliente debe enviar solo esas columnas; para restricción estricta
-- por columna se recomienda mover esta lógica a una función RPC — ver README).
create policy "work_orders: el líder actualiza el estado de su orden" on work_orders
  for update using (leads_group(group_id)) with check (leads_group(group_id));

-- ---- dump_reports ----
create policy "dump_reports: admin acceso total" on dump_reports
  for all using (is_admin()) with check (is_admin());
create policy "dump_reports: el líder ve/crea para su cuadrilla" on dump_reports
  for select using (leads_group(group_id));
create policy "dump_reports: el líder inserta para su cuadrilla" on dump_reports
  for insert with check (leads_group(group_id));

-- ---- shifts ----
create policy "shifts: admin ve todo" on shifts
  for select using (is_admin());
create policy "shifts: el usuario ve y crea las suyas" on shifts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- location_pings ----
create policy "pings: admin ve todo" on location_pings
  for select using (is_admin());
create policy "pings: el usuario inserta/ve los suyos" on location_pings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- 8. Storage: buckets para fotos (bocetos, fotos de vaciado, fotos de cierre)
-- ============================================================
insert into storage.buckets (id, name, public)
values
  ('order-sketches', 'order-sketches', true),
  ('completion-photos', 'completion-photos', true),
  ('dump-photos', 'dump-photos', true)
on conflict (id) do nothing;

-- Cualquier usuario autenticado puede subir; lectura pública (son fotos operativas, no sensibles)
create policy "sketches: lectura pública" on storage.objects
  for select using (bucket_id = 'order-sketches');
create policy "sketches: usuarios autenticados suben" on storage.objects
  for insert with check (bucket_id = 'order-sketches' and auth.role() = 'authenticated');

create policy "completion: lectura pública" on storage.objects
  for select using (bucket_id = 'completion-photos');
create policy "completion: usuarios autenticados suben" on storage.objects
  for insert with check (bucket_id = 'completion-photos' and auth.role() = 'authenticated');

create policy "dumps: lectura pública" on storage.objects
  for select using (bucket_id = 'dump-photos');
create policy "dumps: usuarios autenticados suben" on storage.objects
  for insert with check (bucket_id = 'dump-photos' and auth.role() = 'authenticated');

-- ============================================================
-- Fin del esquema inicial.
-- Siguiente paso: crea tu primer usuario admin (ver README.md,
-- sección "Crear el primer administrador").
-- ============================================================
