// Genera brand.css: @font-face embebidos + el logo de Gamma como data: URI.
// Todo va incrustado porque el CSP de Artifact bloquea cualquier host externo.
const fs = require('fs');

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const LOGO = '/root/.claude/uploads/14bb484a-9ea6-5921-a466-202f6621f9d2/ec91bc28-IMG_0145.png';

// Fraunces y Archivo son variables: un solo archivo cubre todo el rango de peso.
// Una sola familia para todo: Google Sans Flex, variable, con el eje de
// grosor completo (100..1000). Los distintos roles se diferencian por peso
// y espaciado, no por familia.
const CSS_URL = 'https://fonts.googleapis.com/css2'
  + '?family=Google+Sans+Flex:wght@100..1000'
  + '&display=swap';

(async () => {
  const css = await (await fetch(CSS_URL, { headers: { 'User-Agent': UA } })).text();

  const faces = [];
  let total = 0;

  for (const raw of css.split('/*').slice(1)) {
    const subset = raw.slice(0, raw.indexOf('*/')).trim();
    if (subset !== 'latin') continue; // el contenido es ES/EN; latin basta

    const b = raw.slice(raw.indexOf('*/') + 2);
    const family = /font-family: *'([^']+)'/.exec(b)?.[1];
    const weight = /font-weight: *([^;]+);/.exec(b)?.[1]?.trim();
    const style = /font-style: *(\w+)/.exec(b)?.[1] ?? 'normal';
    const url = /url\((https:[^)]+\.woff2)\)/.exec(b)?.[1];
    if (!family || !url) continue;

    const buf = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
    total += buf.length;
    faces.push(
      `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:swap;` +
      `src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2');}`
    );
    console.log(`  ${family.padEnd(15)} ${String(weight).padEnd(9)} ${(buf.length / 1024).toFixed(1).padStart(6)} KB`);
  }

  const logo = fs.readFileSync(LOGO).toString('base64');
  const logoUri = `data:image/png;base64,${logo}`;

  fs.writeFileSync(__dirname + '/brand-fonts.css', faces.join('\n'));
  fs.writeFileSync(__dirname + '/brand-logo.txt', logoUri);

  console.log(`\n  ${faces.length} caras · ${(total / 1024).toFixed(0)} KB crudos`
    + ` · fuentes ${(fs.statSync(__dirname + '/brand-fonts.css').size / 1024).toFixed(0)} KB en base64`);
  console.log(`  logo ${(logoUri.length / 1024).toFixed(0)} KB en base64`);
})();
