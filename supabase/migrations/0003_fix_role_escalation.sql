-- ============================================================
-- RAMAJE — Corrección: escalada de privilegios en profiles
--
-- La migración 0001 dejaba la política "el usuario actualiza su propio
-- perfil" con `using (id = auth.uid())` y sin restricción de columna, así
-- que cualquier líder de cuadrilla podía volverse administrador con un
-- simple:
--
--   update profiles set role = 'admin' where id = auth.uid();
--
-- RLS no puede comparar la fila nueva contra la vieja, así que la
-- restricción por columna se hace con un trigger.
-- ============================================================

-- Añade el `with check` que faltaba: además de poder actualizar solo su
-- propia fila, el usuario tampoco puede reasignarla a otro id.
drop policy if exists "profiles: el usuario actualiza su propio perfil" on profiles;
create policy "profiles: el usuario actualiza su propio perfil" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Solo un admin puede cambiar el rol de un perfil.
--
-- La excepción `auth.uid() is null` cubre el contexto sin sesión: el SQL
-- Editor de Supabase y la `service_role` key del servidor, que es como se
-- crea el primer administrador (ver README). Ahí no hay riesgo: sin sesión,
-- las propias políticas de RLS ya bloquean cualquier update que venga del
-- cliente con la anon key.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar el rol de un perfil';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_escalation on profiles;
create trigger profiles_prevent_role_escalation
  before update on profiles
  for each row execute procedure public.prevent_role_escalation();
