# Ramaje — Backend inicial (Supabase + Next.js)

Este es el arranque real del backend descrito en el documento de
especificación (Fase 1-3): base de datos en Supabase, autenticación
por roles (`admin` / `group_leader`), y un primer módulo funcional
(Órdenes de trabajo) conectado de extremo a extremo.

**Este proyecto está pensado para abrirse y correrse con Claude Code**
(o cualquier editor con terminal), no dentro del chat — aquí no se
puede instalar `node_modules` ni levantar un servidor de verdad.

> Los prototipos HTML originales viven en `design-reference/` y siguen
> siendo la referencia de diseño y de flujo para cada pantalla.

---

## 1. Crea tu proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com), crea una cuenta y un proyecto nuevo.
2. Ve a **SQL Editor** y pega el contenido de `supabase/migrations/0001_init.sql`. Ejecútalo.
3. (Opcional) Si quieres datos de ejemplo, pega y ejecuta también `supabase/migrations/0002_seed.sql`.
4. Ve a **Settings → API** y copia:
   - `Project URL`
   - `anon public key`
   - `service_role key` (¡no la compartas ni la subas a git!)

## 2. Configura el proyecto web

```bash
cd web
cp .env.local.example .env.local
# pega tus 3 valores de Supabase en .env.local
npm install
npm run dev
```

Abre `http://localhost:3000` — te va a redirigir a `/login`.

## 3. Crea tu primer usuario administrador

Supabase Auth crea automáticamente un `profile` con rol `group_leader`
para cualquiera que se registre (ver el trigger `handle_new_user` en
la migración). Para volverte admin:

1. En el dashboard de Supabase, ve a **Authentication → Users** y crea
   tu usuario (o regístrate desde `/login` si agregas una pantalla de
   signup — el starter solo trae login, es fácil de añadir).
2. En **SQL Editor**, corre:
   ```sql
   update profiles set role = 'admin' where id = 'EL-UUID-DE-TU-USUARIO';
   ```
   (el UUID lo ves en Authentication → Users)

## 4. Crea cuadrillas y asigna líderes

Cada líder de cuadrilla necesita existir primero como usuario de
Supabase Auth (mismo paso que el admin, pero sin cambiarle el rol).
Luego:

```sql
update groups set leader_id = 'UUID-DEL-LIDER' where name = 'Eliseo''s Crew';
```

---

## Qué ya funciona

- **Login real** con Supabase Auth (`app/login`)
- **Órdenes de trabajo**: listado y creación conectados de verdad a
  Postgres (`app/orders`), incluyendo **subida real del boceto/diagrama**
  al bucket `order-sketches` de Supabase Storage
- **Asignación de cuadrilla** desde la tabla, con Server Actions
  (`app/orders/actions.ts`)
- **RLS (seguridad a nivel de fila)** ya configurada: un líder de
  cuadrilla solo puede ver/actuar sobre las órdenes de su propia
  cuadrilla; el admin ve y edita todo

## Qué falta (siguientes pasos sugeridos para Claude Code)

Usa el prototipo HTML como referencia de diseño y flujo — pídele a
Claude Code que "porte" cada pantalla del prototipo a este proyecto
real, módulo por módulo:

1. **Traer el diseño real**: copiar los tokens de color/tipografía de
   `ramaje-panel-operaciones.html` a `app/globals.css` y reconstruir
   el layout (sidebar, tarjetas tipo ticket, etc.)
2. **Cronograma / calendario** (`app/calendar`)
3. **Cuadrillas** (`app/crews`) — CRUD completo
4. **Vaciados** (`app/dumps`) — con el campo `dump_type` (chips/logs)
5. **Dashboard** con KPIs reales (contar por estado) y mapa (Mapbox)
6. **App móvil de líderes** (carpeta `mobile/`, ver su propio README):
   - Expo + `@supabase/supabase-js`
   - Reconstruir la lógica de `ramaje-app-lideres.html`:
     - Iniciar / Terminado / No terminado → actualiza `status` en
       `work_orders` (con `started_at` / `completed_at`)
     - Subida de foto de cierre → bucket `completion-photos`,
       guardar la URL en `completion_photo_url`
     - Mostrar `sketch_image_url` de la orden (ya lo carga el admin)
   - Rastreo GPS en segundo plano → `expo-location` +
     inserts periódicos en `location_pings`
7. **Notificaciones push** (Fase 7 del documento original)
8. **Políticas RLS más finas**: ahora mismo el líder puede actualizar
   cualquier columna de sus órdenes; para restringir a solo
   `status` / `completion_photo_url` / `reassign_reason`/
   `started_at` / `completed_at`, la forma más limpia es mover esa
   actualización a una función `RPC` (`security definer`) en vez de
   un `update` directo desde el cliente — pídeselo a Claude Code
   cuando llegues a ese punto.

---

## Estructura

```
supabase/
  migrations/
    0001_init.sql   ← esquema completo + RLS + storage buckets
    0002_seed.sql   ← datos de ejemplo (opcional)
    0003_fix_role_escalation.sql  ← impide que un líder se haga admin
web/                ← Next.js 14 (App Router) + TypeScript
  app/
    login/
    orders/         ← módulo de referencia, ya conectado a Supabase
    auth/           ← server action de cierre de sesión
  lib/
    supabase/       ← clientes de browser y de servidor
    types.ts        ← tipos TS que reflejan el esquema SQL
  middleware.ts     ← protege rutas privadas
mobile/             ← ver mobile/README.md
design-reference/   ← prototipos HTML (panel de operaciones ES/EN + app de líderes)
```

## Cómo continuar en Claude Code

1. Descarga y descomprime este proyecto en tu máquina.
2. Abre la carpeta en tu terminal y corre `claude` (o ábrela desde tu
   editor con la extensión de Claude Code).
3. Dale contexto de una vez, por ejemplo:
   > "Este es el backend de Ramaje. Ya tiene Supabase configurado y el
   > módulo de Órdenes funcionando. Quiero que construyas el módulo de
   > Cuadrillas siguiendo el mismo patrón (Server Component + Server
   > Actions), y que el diseño se vea como
   > ramaje-panel-operaciones.html."
4. Como Claude Code sí puede instalar dependencias y correr el
   servidor, va a poder probar cada cambio en vivo antes de dártelo
   por terminado.
