-- ============================================================
-- GAMMA — poder eliminar sin perder el historial
--
-- Las claves foráneas quedaron sin política de borrado, así que eliminar
-- una cuadrilla fallaba en cuanto tuviera una orden o un vaciado a su
-- nombre. Borrar en cascada tampoco sirve: nadie quiere que dar de baja
-- una cuadrilla se lleve por delante los vaciados del mes.
--
-- La regla es: se borra la cuadrilla, no su rastro. Lo que la referenciaba
-- queda sin cuadrilla y sigue ahí.
-- Correr DESPUÉS de 0005.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Órdenes de trabajo
-- ------------------------------------------------------------
alter table work_orders drop constraint if exists work_orders_group_id_fkey;
alter table work_orders
  add constraint work_orders_group_id_fkey
  foreign key (group_id) references groups(id) on delete set null;

-- ------------------------------------------------------------
-- 2. Vaciados: conservan el lugar, la fecha y el tipo de carga aunque la
--    cuadrilla ya no exista, que es lo que hace falta para los totales.
-- ------------------------------------------------------------
alter table dump_reports drop constraint if exists dump_reports_group_id_fkey;
alter table dump_reports
  add constraint dump_reports_group_id_fkey
  foreign key (group_id) references groups(id) on delete set null;

alter table dump_reports drop constraint if exists dump_reports_work_order_id_fkey;
alter table dump_reports
  add constraint dump_reports_work_order_id_fkey
  foreign key (work_order_id) references work_orders(id) on delete set null;

-- ------------------------------------------------------------
-- 3. Requerimientos: 0004 los borraba en cascada con la cuadrilla. Un
--    pedido resuelto es historial de compras, así que también sobrevive.
-- ------------------------------------------------------------
alter table equipment_requests alter column group_id drop not null;
alter table equipment_requests drop constraint if exists equipment_requests_group_id_fkey;
alter table equipment_requests
  add constraint equipment_requests_group_id_fkey
  foreign key (group_id) references groups(id) on delete set null;

-- El líder sigue sin poder crear pedidos huérfanos ni ajenos.
drop policy if exists "requests: el líder crea para su cuadrilla" on equipment_requests;
create policy "requests: el líder crea para su cuadrilla" on equipment_requests
  for insert with check (group_id is not null and leads_group(group_id) and state = 'new');

-- ------------------------------------------------------------
-- 4. Las fotos sí desaparecen con su orden: sin la orden no significan
--    nada, y dejarlas solo llena el bucket.
-- ------------------------------------------------------------
alter table work_order_photos drop constraint if exists work_order_photos_work_order_id_fkey;
alter table work_order_photos
  add constraint work_order_photos_work_order_id_fkey
  foreign key (work_order_id) references work_orders(id) on delete cascade;

-- ============================================================
-- Fin.
-- ============================================================
