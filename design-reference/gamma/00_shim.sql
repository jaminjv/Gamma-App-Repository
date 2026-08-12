-- Stub local de lo que aporta Supabase, solo para validar las migraciones
-- en un Postgres vacío. NO forma parte del proyecto.
create extension if not exists "pgcrypto";

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb
);

-- auth.uid() / auth.role() simulados con GUCs de sesión
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('test.role', true), ''), 'anon');
$$;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text
);
alter table storage.objects enable row level security;

-- Rol no-superusuario para que RLS realmente aplique.
-- Los roles son del clúster y no de la base: hay que tolerar que ya exista.
do $$ begin
  create role app_user nologin;
exception when duplicate_object then null; end $$;
grant usage on schema public, auth, storage to app_user;
