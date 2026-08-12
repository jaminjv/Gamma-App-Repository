# Conectar Gamma a Supabase

Guía de cero a que las dos aplicaciones compartan datos de verdad.
Unos 20 minutos, todo gratis.

---

## Primero: por qué no te está funcionando

Hay dos razones, y probablemente te toquen las dos.

**1. Los enlaces publicados nunca van a conectarse.** Corren dentro de un
entorno aislado que bloquea toda petición a servidores externos. No importa
qué pegues en la pantalla de conexión: la petición no sale. Los enlaces
sirven para enseñar el producto, no para operar.

**2. Todavía no existe el proyecto de Supabase.** Sin él no hay a dónde
conectarse. Eso es lo que resuelve esta guía.

> Acabo de actualizar las dos aplicaciones para que, si intentas conectar
> desde el enlace publicado, te digan exactamente eso en vez de un error
> genérico.

---

## Paso 1 · Descarga los dos archivos

Te los mandé en el chat:

- `operations-dashboard.html` → la oficina
- `app-lideres.html` → los líderes

Guárdalos donde los encuentres. **Ábrelos con doble clic**: ahí sí pueden
conectarse.

---

## Paso 2 · Crea el proyecto de Supabase

1. Entra a **supabase.com** y crea una cuenta (el plan gratis alcanza de
   sobra para cinco cuadrillas).
2. **New project**.
   - *Name*: `gamma-tree-experts`
   - *Database Password*: genera una y guárdala en tu gestor de contraseñas.
     No la vas a usar casi nunca, pero no se puede recuperar.
   - *Region*: `East US (North Virginia)` es la más cercana a Belleville.
3. Espera un par de minutos a que termine de crearse.

---

## Paso 3 · Crea las tablas

Ve a **SQL Editor** (icono `>_` en la barra izquierda) → **New query**.

Vas a pegar y ejecutar **cuatro archivos, en este orden**. Están en el repo,
en la carpeta `supabase/migrations/`:

| Orden | Archivo | Qué hace |
|---|---|---|
| 1 | `0001_init.sql` | Tablas base y seguridad |
| 2 | `0003_fix_role_escalation.sql` | Cierra un hueco de permisos |
| 3 | `0004_gamma_model.sql` | Todo lo que construimos después |
| 4 | `0005_client_ready.sql` | Lo que necesitan las apps |

Para cada uno: pega el contenido completo, pulsa **Run**, y espera el
`Success`. Luego limpia el editor y sigue con el siguiente.

> **No corras `0002_seed.sql`.** Son datos de ejemplo del proyecto viejo y
> solo te van a estorbar.

---

## Paso 4 · Crea las cuentas

**Authentication** → **Users** → **Add user** → *Create new user*.

Marca **Auto Confirm User** en cada una, o no podrán entrar.

| Correo | Contraseña | Quién |
|---|---|---|
| `paul@gammatree.com` | la que elijas | oficina |
| `eliseo@gammatree.com` | la que elijas | líder |
| `ivan@gammatree.com` | la que elijas | líder |
| …una por cada líder | | |

Después vuelve al **SQL Editor** y ejecuta esto para volver administrador a
Paul:

```sql
update profiles set role = 'admin' where email = 'paul@gammatree.com';
```

Debe decir `UPDATE 1`. Si dice `UPDATE 0`, el correo no coincide.

### Cierra el registro público

**Authentication** → **Providers** → **Email** → desactiva **Enable Sign
Ups** → *Save*.

Si lo dejas abierto, cualquier persona con un correo puede registrarse y
entrar como líder de cuadrilla.

---

## Paso 5 · Copia las dos llaves

**Settings** (engranaje) → **API**. Copia:

- **Project URL** — `https://algo.supabase.co`
- **anon** **public** — la llave larga que empieza con `eyJ`

La `anon` es pública por diseño; lo que protege los datos es la seguridad por
fila que quedó configurada en el paso 3. **La `service_role` no se usa aquí
y no debe salir de tu computadora.**

---

## Paso 6 · Conecta la oficina

Abre `operations-dashboard.html` con doble clic.

1. **Connect to Supabase**
2. Pega la URL y la llave anon
3. **Save and test** — hace una lectura real contra tu proyecto, así que si
   algo está mal te lo dice ahí mismo
4. Entra con `paul@gammatree.com` y su contraseña

Arriba a la izquierda debe aparecer **Connected to Supabase** en verde.

---

## Paso 7 · Da de alta las cuadrillas

En el panel: **Crews** → **New crew**.

El correo que pongas es **el acceso del líder a su app**. La base enlaza sola
la cuadrilla con la cuenta, sin importar el orden en que las hayas creado.

Crea también un par de órdenes en **Work Orders** y asígnalas.

---

## Paso 8 · Conecta el teléfono

Manda `app-lideres.html` al teléfono del líder (WhatsApp, correo, lo que sea)
y que lo abra.

1. **Conectar con la oficina**
2. Pega la misma URL y la misma llave
3. Entra con su propio correo

Debe ver únicamente los trabajos de su cuadrilla. Prueba a crear una orden
desde la oficina: **aparece sola en el teléfono en unos ocho segundos**, sin
recargar nada.

---

## Paso 9 · Para el uso diario

Sube los dos archivos a un hosting estático gratuito —**Netlify Drop** es
literalmente arrastrar la carpeta— y reparte los enlaces. En el teléfono,
**Añadir a pantalla de inicio** los deja con su icono y a pantalla completa,
como una app.

---

## Si algo sale mal

| Lo que ves | Qué pasa |
|---|---|
| «This published link cannot connect» | Estás en el enlace publicado. Usa el archivo descargado. |
| «No answer from that URL» | La URL está incompleta o el proyecto está pausado. |
| «Invalid login credentials» | Falta *Auto Confirm User*, o la contraseña no es esa. |
| Entra pero no ve nada | Falta el `update profiles set role='admin'`. |
| El líder no ve trabajos | Su cuadrilla no tiene su correo en *leader email*, o no tiene órdenes asignadas. |
| Error al correr el SQL | Los archivos van en orden. Si te saltaste uno, córrelo antes. |

---

## Lo que este montaje no da

Son páginas web, no apps instaladas. Quedan fuera el **GPS en segundo
plano**, las **notificaciones push** y el **trabajo sin señal**. Las tres
necesitan la app en Expo — pero el esquema y la capa de datos que ya existen
sirven igual para ese paso.
