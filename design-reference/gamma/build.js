// Ensambla las dos plataformas: inyecta fuentes, sistema de diseño, capa de
// interacción y logo en cada plantilla. Las rutas de salida son las mismas de
// la publicación anterior, para que los enlaces no cambien.
const fs = require('fs');
const path = require('path');

const D = __dirname;
const fonts = fs.readFileSync(path.join(D, 'brand-fonts.css'), 'utf8');
const logo  = fs.readFileSync(path.join(D, 'brand-logo.txt'), 'utf8');
const css   = fs.readFileSync(path.join(D, 'src/glass.css'), 'utf8');
const js    = fs.readFileSync(path.join(D, 'src/glass.js'), 'utf8');
const esen  = fs.readFileSync(path.join(D, 'src/es-en.js'), 'utf8');
const store = fs.readFileSync(path.join(D, 'src/store.js'), 'utf8');

const builds = [
  { src: 'src/dashboard.html', out: 'artifacts/operations-dashboard.html' },
  { src: 'src/leader.html',    out: 'artifacts/app-lideres.html' },
];

fs.mkdirSync(path.join(D, 'artifacts'), { recursive: true });

for (const b of builds) {
  let page = fs.readFileSync(path.join(D, b.src), 'utf8');

  // Reemplazo por función: evita que $& y similares del base64 se interpreten.
  page = page.replace('/*__FONTS__*/',     () => fonts);
  page = page.replace('/*__GLASS_CSS__*/', () => css);
  page = page.replace('/*__GLASS_JS__*/',  () => js);
  page = page.replace('/*__ES_EN__*/',     () => esen);
  page = page.replace('/*__STORE__*/',     () => store);
  page = page.replace(/__LOGO__/g,         () => logo);

  const outPath = path.join(D, b.out);
  fs.writeFileSync(outPath, page);

  // Comprobaciones de publicación.
  const leftovers = page.match(/__[A-Z_]+__|\/\*__[A-Z_]+__\*\//g);
  const titleAt = Buffer.byteLength(page.slice(0, page.indexOf('</title>')));
  const external = (page.match(/(?:src|href)=["'](https?:\/\/[^"']+)/g) || []);
  const wrappers = (page.match(/<!DOCTYPE|<html|<\/html>|<head>|<body[ >]/gi) || []);

  console.log(
    `${path.basename(b.out).padEnd(26)} ${(Buffer.byteLength(page)/1024).toFixed(0).padStart(4)} KB | ` +
    `title @ ${titleAt}B ${titleAt < 8192 ? 'OK' : '¡FUERA!'} | ` +
    `placeholders: ${leftovers ? leftovers.join(',') : 'ninguno'} | ` +
    `externos: ${external.length || 'ninguno'} | ` +
    `envoltorios: ${wrappers.length || 'ninguno'}`
  );
}
