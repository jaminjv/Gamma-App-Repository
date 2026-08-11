# Gamma Tree Experts — prototipos rediseñados

Las dos plataformas con la identidad de Gamma Tree Experts: el panel de
administración (en inglés) y la app de líderes de cuadrilla (ES/EN).
Sustituyen a los prototipos de Ramaje que están un nivel más arriba.

## Qué hay aquí

```
src/
  glass.css      ← sistema de diseño: tokens, vidrio líquido, movimiento
  glass.js       ← fondo ambiental, revelados, reflejo, ondas, persistencia
  dashboard.html ← panel de administración (plantilla)
  leader.html    ← app de líderes (plantilla)
dist/            ← las dos páginas ya ensambladas, listas para el navegador
brand.js         ← descarga las fuentes y codifica el logo en base64
build.js         ← inyecta fuentes + diseño + logo en las plantillas
verify.js        ← prueba funcional con navegador real
gamma-logo.png   ← logo original
brand-fonts.css  ← fuentes ya embebidas (generado por brand.js)
brand-logo.txt   ← logo como data: URI (generado por brand.js)
```

## Ver las plataformas

Abre cualquiera de los dos archivos de `dist/` en el navegador. Son
autocontenidos: no necesitan servidor, ni conexión, ni dependencias.

## Reconstruir

```bash
node brand.js   # solo si cambia el logo o la tipografía (necesita red)
node build.js   # ensambla dist/ desde src/
node verify.js  # requiere: npm install playwright
```

`build.js` comprueba en cada corrida que no queden marcadores sin
sustituir, que no haya referencias a hosts externos, que no se cuelen
etiquetas `<html>`/`<head>`/`<body>` y que el `<title>` caiga dentro de los
primeros 8 KB. Esas cuatro condiciones son las que exige la plataforma de
publicación.

## Paleta

Sacada directamente del logo:

| Token | Valor | De dónde sale |
|---|---|---|
| `--burgundy` | `#811428` | el escudo |
| `--gold` | `#A89030` | los cuadrantes |
| `--cream` | `#DACFA1` | la cinta "SINCE 1954" |
| `--forest` | `#2D6F4A` | el follaje y la hoja |

Tipografías: **Fraunces** para títulos (serif con aire patrimonial, a tono
con el wordmark grabado), **Archivo** para interfaz y **IBM Plex Mono**
para datos y etiquetas.

El diseño se compromete deliberadamente con un único mundo visual oscuro:
el vidrio necesita un fondo rico que refractar, así que no hay variante
clara y todos los fondos se pintan de forma explícita.

## Cuentas de prueba

| Dónde | Usuario | Contraseña |
|---|---|---|
| Panel | `paul@gammatree.com` | no se valida |
| App | `eliseo@gammatree.com` y los demás líderes | `gamma1954` |

Los otros líderes son `ivan@`, `jose@`, `baltazar@` y `ron@gammatree.com`.

## Sobre los datos

Cada prototipo guarda su estado en `localStorage` bajo el prefijo
`gamma.v1.`, así que lo que hagas sobrevive a recargar la página. La app de
líderes deja lo que envía (vaciados y requerimientos) en una bandeja
compartida que el panel lee al abrir: si el navegador sirve ambas páginas
desde el mismo origen, lo que reporta un líder aparece solo en el panel.
Entre dispositivos distintos eso no ocurre — esa sincronía es trabajo del
backend en Supabase, no del prototipo.
