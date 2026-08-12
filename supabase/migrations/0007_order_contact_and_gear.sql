-- ============================================================
-- GAMMA — contacto del cliente y equipo múltiple en la orden
--
--   · Nombre y teléfono de quien contrata, para que la cuadrilla pueda
--     llamar desde el propio trabajo.
--   · El equipo pasa de uno solo a varios, con dos opciones nuevas
--     (triturador de tocones y camión de troncos). Eso deja sin sentido
--     el valor combinado "ambos": ahora se marcan las dos casillas.
--
-- Correr DESPUÉS de 0006.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Contacto del cliente
-- ------------------------------------------------------------
alter table work_orders
  add column if not exists customer_name  text,
  add column if not exists customer_phone text;

comment on column work_orders.customer_phone is
  'La app del líder lo muestra como enlace de llamada.';

-- ------------------------------------------------------------
-- 2. Equipo requerido, ahora varios por orden
--    Tipo nuevo en vez de ampliar equipment_type: ese sigue describiendo
--    a la cuadrilla, que es otra cosa, y `alter type ... add value` no
--    deja usar el valor recién creado en la misma transacción.
-- ------------------------------------------------------------
do $$ begin
  create type gear_kind as enum ('bucket','climbing','stump_grinder','logs');
exception when duplicate_object then null; end $$;

alter table work_orders add column if not exists gear gear_kind[] not null default '{}';

-- "ambos" se convierte en las dos casillas marcadas, que es lo que
-- siempre quiso decir.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name='work_orders' and column_name='equipment_required') then
    update work_orders set gear = case equipment_required::text
        when 'bucket'   then array['bucket']::gear_kind[]
        when 'climbing' then array['climbing']::gear_kind[]
        when 'ambos'    then array['bucket','climbing']::gear_kind[]
        else '{}'::gear_kind[]
      end
    where cardinality(gear) = 0;
    alter table work_orders drop column equipment_required;
  end if;
end $$;

create index if not exists idx_work_orders_gear on work_orders using gin(gear);

-- ============================================================
-- Fin. `equipment_type` se conserva: sigue describiendo a la cuadrilla.
-- ============================================================
