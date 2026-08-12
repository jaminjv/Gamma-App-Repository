/* Pegados reales que la gente hace al copiar del panel de Supabase.
   Los cuatro primeros deben conectar igual; los dos últimos deben explicar
   el problema en pantalla en vez de fallar con un error críptico. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs');
const mock = require('./mock-supabase');
const D = __dirname, KEY = 'anon-key-para-pruebas-1234567890';
const fail = [];
const check=(c,l)=>{console.log(`   ${c?'✓':'✗ FALLA:'} ${l}`); if(!c) fail.push(l);};

(async()=>{
  const api = await mock.start('postgresql://postgres@/gamma_sync?host=/tmp/pgs');
  const API = `http://localhost:${api.port}`;
  const page404 = `<!doctype html><head></head><body>`;
  const PAGES = {
    '/dashboard': page404 + fs.readFileSync(D+'/artifacts/operations-dashboard.html','utf8') + '</body>',
    '/leader':    page404 + fs.readFileSync(D+'/artifacts/app-lideres.html','utf8') + '</body>',
  };
  const web = http.createServer((q,r)=>{const b=PAGES[q.url.split('?')[0]];
    if(!b){r.writeHead(404);return r.end();}
    r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); r.end(b);});
  await new Promise(r=>web.listen(0,r));
  const W = web.address().port;

  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const errors=[];

  async function intenta(ruta, valor, etiqueta, espera){
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    p.on('pageerror', e=>errors.push(`[${etiqueta}] ${e}`));
    await p.goto(`http://localhost:${W}${ruta}`);
    await p.waitForTimeout(400);
    await p.click('#cfg-btn'); await p.waitForTimeout(350);
    await p.fill('#cf-url', valor); await p.fill('#cf-key', KEY);
    await p.click('#cf-save'); await p.waitForTimeout(1100);

    const conectado = await p.locator('.conn-on').count() > 0;
    const aviso = (await p.locator('.err').allTextContents()).join(' ');
    if(espera === 'conecta'){
      check(conectado, `${etiqueta} → conecta igual`);
    }else{
      check(!conectado && new RegExp(espera,'i').test(aviso),
        `${etiqueta} → explica el problema ("${aviso.slice(0,58).trim()}…")`);
    }
    await ctx.close();
  }

  console.log('── Panel: pegados con basura alrededor ──');
  await intenta('/dashboard', API,            'limpia',              'conecta');
  await intenta('/dashboard', API + '/',      'con barra final',     'conecta');
  await intenta('/dashboard', '  ' + API + ' \n', 'con espacios y salto', 'conecta');
  await intenta('/dashboard', API + '/rest/v1',  'con /rest/v1',     'conecta');
  await intenta('/dashboard', 'https://supabase.com/dashboard/project/abcdefgh',
                'la URL del panel de Supabase', 'dashboard address');
  await intenta('/dashboard', 'no-es-una-url', 'texto cualquiera',   'does not look like');

  console.log('\n── App de líderes ──');
  await intenta('/leader', '  ' + API + '/rest/v1/ \n', 'con espacios y sufijo', 'conecta');
  await intenta('/leader', 'https://supabase.com/dashboard/project/abcdefgh',
                'la URL del panel de Supabase', 'panel de Supabase');

  await browser.close(); web.close(); api.server.close(); await api.db.end();
  console.log(`\n${errors.length?'ERRORES JS:\n'+errors.join('\n'):'Errores de JavaScript: 0'}`);
  console.log(fail.length?`\nFALLARON ${fail.length}`:'\nTodas las comprobaciones pasaron.');
  process.exit(fail.length||errors.length?1:0);
})();
