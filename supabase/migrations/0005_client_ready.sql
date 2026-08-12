-- ============================================================
-- GAMMA — ajustes para que las aplicaciones operen contra la base
-- directamente, con la anon key y RLS.
-- Correr DESPUÉS de 0004.
-- ============================================================

-- ------------------------------------------------------------
-- 1. El correo del perfil
--    profiles no lo guardaba: vivía solo en auth.users, que el cliente no
--    puede consultar. Sin él no se puede enlazar una cuadrilla con su líder.
-- ------------------------------------------------------------
alter table profiles add column if not exists email text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    'group_leader'
  );
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. La cuadrilla se crea antes que el usuario del líder
--    El admin da de alta la cuadrilla con el correo del líder; el líder se
--    registra después. Guardar nombre y correo en la propia cuadrilla
--    permite ese orden, y un trigger enlaza leader_id en cuanto el perfil
--    aparece.
-- ------------------------------------------------------------
alter table groups
  add column if not exists leader_name  text,
  add column if not exists leader_email text;

create unique index if not exists idx_groups_leader_email
  on groups (lower(leader_email)) where leader_email is not null;

create or replace function public.link_group_leader()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update groups
     set leader_id = new.id
   where leader_id is null
     and lower(leader_email) = lower(new.email);
  return new;
end;
$$;

drop trigger if exists profiles_link_group_leader on profiles;
create trigger profiles_link_group_leader
  after insert on profiles
  for each row execute procedure public.link_group_leader();

-- …y el simétrico: la cuadrilla se da de alta cuando el líder YA tiene
-- cuenta. Sin este, el orden habitual —crear primero las cuentas en Supabase
-- Auth y después las cuadrillas desde el panel— deja leader_id en nulo y el
-- líder no ve ninguna orden.
create or replace function public.link_leader_on_group()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.leader_id is null and new.leader_email is not null then
    select id into new.leader_id
      from profiles where lower(email) = lower(new.leader_email);
  end if;
  return new;
end;
$$;

drop trigger if exists groups_link_leader on groups;
create trigger groups_link_leader
  before insert or update of leader_email on groups
  for each row execute procedure public.link_leader_on_group();

-- Enlaza lo que ya existiera.
update groups g set leader_id = p.id
  from profiles p
 where g.leader_id is null
   and g.leader_email is not null
   and lower(p.email) = lower(g.leader_email);

-- ------------------------------------------------------------
-- 3. El líder necesita leer las cuadrillas para saber cuál es la suya
--    La política de 0001 solo dejaba ver aquella donde ya era leader_id, lo
--    que se muerde la cola antes del enlace.
-- ------------------------------------------------------------
drop policy if exists "groups: el líder ve su cuadrilla" on groups;
create policy "groups: el líder ve su cuadrilla" on groups
  for select using (
    leader_id = auth.uid()
    or lower(leader_email) = lower((select email from profiles where id = auth.uid()))
  );

-- El líder consulta su propio perfil; ya lo permitía 0001.

-- ------------------------------------------------------------
-- 4. Bucket para las fotos del trabajo
--    Las imágenes van a Storage y no a una columna de texto: un data URI
--    por foto infla cada fila y se descarga entera en cada consulta.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('order-photos', 'order-photos', true)
on conflict (id) do nothing;

drop policy if exists "order-photos: lectura pública" on storage.objects;
create policy "order-photos: lectura pública" on storage.objects
  for select using (bucket_id = 'order-photos');

drop policy if exists "order-photos: usuarios autenticados suben" on storage.objects;
create policy "order-photos: usuarios autenticados suben" on storage.objects
  for insert with check (bucket_id = 'order-photos' and auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- 5. El líder cierra sus propias órdenes
--    0001 lo dejaba actualizar cualquier columna. Se restringe a lo que le
--    toca mediante una función, y se le quita el update directo.
-- ------------------------------------------------------------
drop policy if exists "work_orders: el líder actualiza el estado de su orden" on work_orders;

create or replace function public.crew_update_order(
  p_order   uuid,
  p_state   order_state,
  p_photo   text default null,
  p_reason  text default null
)
returns work_orders
language plpgsql security definer set search_path = public
as $$
declare
  o work_orders;
begin
  select * into o from work_orders where id = p_order;
  if not found then raise exception 'Orden inexistente'; end if;
  if not (leads_group(o.group_id) or is_admin()) then
    raise exception 'Esta orden no es de tu cuadrilla';
  end if;
  if p_state not in ('progress','done','flag') then
    raise exception 'Una cuadrilla solo puede iniciar, terminar o marcar para reasignar';
  end if;

  update work_orders
     set state                = p_state,
         completion_photo_url = coalesce(p_photo, completion_photo_url),
         reassign_reason      = coalesce(p_reason, reassign_reason),
         started_at   = case when p_state = 'progress' and started_at is null
                             then now() else started_at end,
         completed_at = case when p_state = 'done' then now() else completed_at end
   where id = p_order
   returning * into o;

  return o;
end;
$$;

-- El rol `authenticated` lo aporta Supabase; en un Postgres pelado no existe,
-- así que el grant se salta en vez de cortar la migración.
do $$ begin
  revoke all on function public.crew_update_order(uuid, order_state, text, text) from public;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.crew_update_order(uuid, order_state, text, text) to authenticated;
  end if;
end $$;

-- ============================================================
-- Fin.
-- ============================================================
