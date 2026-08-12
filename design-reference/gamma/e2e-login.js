const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs');
const mock = require('./mock-supabase');
const D=__dirname, KEY='anon-key-para-pruebas-1234567890';
const fail=[]; const check=(c,l)=>{console.log(`   ${c?'✓':'✗ FALLA:'} ${l}`); if(!c) fail.push(l);};
(async()=>{
  const api=await mock.start('postgresql://postgres@/gamma_sync?host=/tmp/pgs');
  const API=`http://localhost:${api.port}`;
  const P={'/dashboard':`<!doctype html><head></head><body>${fs.readFileSync(D+'/artifacts/operations-dashboard.html','utf8')}</body>`,
           '/leader':`<!doctype html><head></head><body>${fs.readFileSync(D+'/artifacts/app-lideres.html','utf8')}</body>`};
  const web=http.createServer((q,r)=>{const b=P[q.url.split('?')[0]];if(!b){r.writeHead(404);return r.end();}
    r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(b);});
  await new Promise(r=>web.listen(0,r)); const W=web.address().port;
  const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const errors=[];

  // --- Sin conectar: la demostración sigue cómoda ---
  let ctx=await br.newContext(), p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(String(e)));
  await p.goto(`http://localhost:${W}/dashboard`); await p.waitForTimeout(500);
  check(await p.locator('#lg-pass').inputValue()==='gamma1954',
    'sin conectar, la contraseña de demostración sigue precargada');
  await ctx.close();

  // --- Conectado: nada precargado ---
  ctx=await br.newContext(); p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(String(e)));
  await p.goto(`http://localhost:${W}/dashboard`); await p.waitForTimeout(400);
  await p.click('#cfg-btn'); await p.waitForTimeout(300);
  await p.fill('#cf-url',API); await p.fill('#cf-key',KEY);
  await p.click('#cf-save'); await p.waitForTimeout(1100);
  check(await p.locator('#lg-pass').inputValue()==='',
    'conectado, el campo de contraseña queda VACÍO');
  check(await p.locator('#lg-email').inputValue()==='',
    'conectado, el correo tampoco viene precargado');

  // --- Credenciales malas: el mensaje debe orientar ---
  await p.fill('#lg-email','paul@gammatree.com');
  await p.fill('#lg-pass','contrasena-equivocada');
  await p.click('#lg-btn'); await p.waitForTimeout(1200);
  const msg=await p.locator('.err').first().textContent();
  check(/invited|Authentication → Users/i.test(msg),
    `el error explica las tres causas ("${msg.slice(0,52).trim()}…")`);
  check(msg.includes('localhost'), 'y dice a qué proyecto está conectado');

  // --- Con la contraseña correcta entra ---
  await p.fill('#lg-pass','gamma1954');
  await p.click('#lg-btn'); await p.waitForTimeout(1500);
  check(await p.locator('.rail').count()===1, 'con la contraseña correcta entra');
  await ctx.close();

  await br.close(); web.close(); api.server.close(); await api.db.end();
  console.log(`\n${errors.length?'ERRORES JS:\n'+errors.join('\n'):'Errores de JavaScript: 0'}`);
  console.log(fail.length?`\nFALLARON ${fail.length}`:'\nTodas las comprobaciones pasaron.');
  process.exit(fail.length||errors.length?1:0);
})();
