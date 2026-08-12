# Poner las dos aplicaciones a operar de verdad

Las dos plataformas ya saben hablar con un backend. Sin configurar funcionan
en **modo demostración** (los datos viven en el navegador y no se comparten);
apuntadas al mismo proyecto de Supabase, la oficina y los teléfonos comparten
una sola base y los datos viajan entre ellos.

Esta guía va de cero a operando. Toma unos 20 minutos.

---

## Antes de empezar: dónde funciona y dónde no

| Dónde abras los archivos | Modo demostración | Conectado a Supabase |
|---|---|---|
| El enlace publicado (artifact) | Sí | **No** |
| El archivo en tu computadora (doble clic) | Sí | Sí |
| Servido desde tu propio hosting | Sí | Sí |

El enlace publicado corre en un entorno aislado que bloquea toda petición a
servidores externos. No es algo que se pueda programar para esquivar: para
operar de verdad hay que servir los archivos por tu cuenta, cosa que es
gratis y toma cinco minutos (último paso de esta guía).

---

## 1. Crear el proyecto

1. Entra a [supabase.com](https://supabase.com) y crea un proyecto.
2. Anota la contraseña de la base que te pida; la vas a necesitar rara vez,
   pero no se puede recuperar.
3. Elige la región más cercana a Belleville — `us-east-1` va bien.

## 2. Crear el esquema

En **SQL Editor**, pega y ejecuta **en este orden**:

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0003_fix_role_escalation.sql`
3. `supabase/migrations/0004_gamma_model.sql`
4. `supabase/migrations/0005_client_ready.sql`
5. `supabase/migrations/0006_deletable.sql`
6. `supabase/migrations/0007_order_contact_and_gear.sql`

> El `0002_seed.sql` es solo datos de ejemplo del proyecto original. No lo
> corras si vas a operar de verdad.

## 3. Crear las cuentas

En **Authentication → Users → Add user**, con *Auto Confirm User* activado:

| Correo | Quién |
|---|---|
| `paul@gammatree.com` | administración |
| `eliseo@gammatree.com` | líder |
| `ivan@gammatree.com` | líder |
| …una por cada líder | |

Después, en **SQL Editor**, convierte a Paul en administrador:

```sql
update profiles set role = 'admin' where email = 'paul@gammatree.com';
```

**Desactiva el registro público** en Authentication → Providers → Email:
quita *Enable Sign Ups*. Si lo dejas abierto, cualquiera con un correo entra
como líder.

## 4. Copiar las llaves

En **Settings → API** copia:

- **Project URL** — algo como `https://abcdefgh.supabase.co`
- **anon public** — la llave larga que empieza con `eyJ`

La anon key es pública por diseño: lo que protege los datos es RLS, que ya
quedó configurado en las migraciones. La `service_role` **no** se usa aquí y
no debe salir del servidor.

## 5. Conectar las aplicaciones

En cada aplicación, en la pantalla de acceso:

1. Pulsa **Connect to Supabase** (en la app de líderes, *Conectar con la
   oficina*).
2. Pega la URL y la anon key.
3. **Save and test** — hace una lectura real contra tu proyecto, así que si
   algo está mal te lo dice ahí mismo en vez de fallar después.
4. Entra con el correo y la contraseña que creaste en el paso 3.

La configuración queda guardada en ese navegador. Cada líder lo hace una vez
en su teléfono.

## 6. Dar de alta las cuadrillas

Desde el panel, **Crews → New crew**. El correo que pongas ahí es el acceso
del líder: la base enlaza sola la cuadrilla con su cuenta, sin importar si
creaste antes la cuenta o antes la cuadrilla.

## 7. Servir los archivos

Los dos archivos de `design-reference/gamma/dist/` son autocontenidos. Sube
esa carpeta a cualquier hosting estático gratuito — Netlify Drop, Cloudflare
Pages, Vercel o GitHub Pages — y comparte los enlaces.

En el teléfono, los líderes abren el suyo y usan **Añadir a pantalla de
inicio**: queda con su icono y a pantalla completa, como una app.

---

## Cómo viajan los datos

```
   PANEL (oficina)                            APP (teléfono del líder)
        │                                              │
        │  crea órdenes, asigna cuadrilla,             │  inicia y cierra trabajos,
        │  edita habilidades, atiende pedidos          │  reporta vaciados y pedidos
        ▼                                              ▼
   ┌──────────────────────────────────────────────────────────┐
   │                     SUPABASE (Postgres)                   │
   │  RLS decide qué ve cada quien: el admin todo, el líder    │
   │  solo lo de su cuadrilla. Ningún filtro vive en el cliente.│
   └──────────────────────────────────────────────────────────┘
```

Cada aplicación relee cada 8 segundos, así que lo que hace la oficina aparece
en el teléfono sin que nadie recargue nada, y al revés.

Un líder **no puede** cambiar el estado de una orden a mano: pasa por una
función del servidor que verifica que la orden sea de su cuadrilla y que el
estado sea uno de los tres que le corresponden (iniciar, terminar, reasignar).

---

## Lo que este montaje todavía no da

Son archivos web, no aplicaciones instaladas. Eso deja fuera tres cosas del
documento original:

- **GPS en segundo plano** — el navegador solo entrega ubicación con la
  pantalla encendida y la página abierta.
- **Notificaciones push** al teléfono.
- **Trabajo sin señal** — si no hay datos, no hay sincronía.

Las tres necesitan la app en Expo. El esquema y la capa de datos que ya están
sirven igual para ese paso, así que no se tira nada.

---

## Si algo falla

| Síntoma | Causa habitual |
|---|---|
| «Could not reach that project» | URL mal copiada, o falta correr alguna migración |
| Entra pero no ve nada | Falta correr `update profiles set role='admin'` |
| El líder no ve trabajos | Su cuadrilla no tiene ese correo en *leader email* |
| Nada sincroniza | Estás en el enlace publicado; sirve los archivos por tu cuenta |
