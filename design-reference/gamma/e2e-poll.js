/* Reproduce el síntoma reportado: llenar el formulario de vaciado despacio,
   más lento que el sondeo de 8 s, y comprobar que no se borra ni se reanima
   la pantalla sola. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs');
const { execSync } = require('child_process');
const mock = require('./mock-supabase');
const D=__dirname, KEY='anon-key-para-pruebas-1234567890';
const fail=[]; const check=(c,l)=>{console.log(`   ${c?'✓':'✗ FALLA:'} ${l}`); if(!c) fail.push(l);};

(async()=>{
  const M='/home/user/Gamma-App-Repository/supabase/migrations';
  const psql=(f)=>execSync(`psql -h /tmp/pgs -U postgres -d gamma_poll -v ON_ERROR_STOP=1 -q -f ${f} 2>&1`).toString();
  execSync(`psql -h /tmp/pgs -U postgres -tAc "drop database if exists gamma_poll" 2>&1`);
  execSync(`psql -h /tmp/pgs -U postgres -tAc "create database gamma_poll" 2>&1`);
  psql(D+'/00_shim.sql');
  for(const m of ['0001_init.sql','0003_fix_role_escalation.sql','0004_gamma_model.sql','0005_client_ready.sql']) psql(`${M}/${m}`);
  psql(D+'/seed-sync.sql');

  const api=await mock.start('postgresql://postgres@/gamma_poll?host=/tmp/pgs');
  const API=`http://localhost:${api.port}`;
  const body=fs.readFileSync(D+'/artifacts/app-lideres.html','utf8');
  const web=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    r.end(`<!doctype html><head></head><body>${body}</body>`);});
  await new Promise(r=>web.listen(0,r)); const W=web.address().port;

  const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const ctx=await br.newContext(); const p=await ctx.newPage();
  const errors=[]; p.on('pageerror',e=>errors.push(String(e)));
  await p.setViewportSize({width:460,height:940});
  await p.goto(`http://localhost:${W}/`); await p.waitForTimeout(400);

  await p.click('#cfg-btn'); await p.waitForTimeout(300);
  await p.fill('#cf-url',API); await p.fill('#cf-key',KEY);
  await p.click('#cf-save'); await p.waitForTimeout(900);
  await p.fill('#lg-email','eliseo@gammatree.com'); await p.fill('#lg-pass','gamma1954');
  await p.click('#lg-btn'); await p.waitForTimeout(1500);

  // Cuenta cuántas veces se vuelve a dibujar la pantalla.
  await p.evaluate(()=>{ window.__repintados=0;
    const orig=window.render; window.render=function(){ window.__repintados++; return orig.apply(this,arguments); };
  });

  await p.click('[data-tab="dump"]'); await p.waitForTimeout(600);
  const trasCambioDeTab = await p.evaluate(()=>window.__repintados);

  // Llenar despacio: 14 s en total, o sea el sondeo dispara al menos una vez.
  await p.click('#d-where');
  for(const parte of ['Frank ','Scott ','Dump ','Site']){
    await p.type('#d-where', parte, {delay:60});
    await p.waitForTimeout(3500);
  }
  const loEscrito = await p.locator('#d-where').inputValue();
  check(loEscrito==='Frank Scott Dump Site',
    `lo escrito sobrevive al sondeo ("${loEscrito}")`);
  check(await p.evaluate(()=>document.activeElement?.id)==='d-where',
    'el cursor sigue dentro del campo');

  const repintadosDurante = await p.evaluate(()=>window.__repintados) - trasCambioDeTab;
  check(repintadosDurante===0,
    `sin datos nuevos, la pantalla no se repinta sola (${repintadosDurante} repintados en 14 s)`);

  // Y el envío sigue funcionando.
  await p.fill('#d-notes','Carga completa de astillas.');
  await p.click('#d-send'); await p.waitForTimeout(1600);
  check((await p.locator('.hist').first().textContent()).includes('Frank Scott'),
    'el vaciado se envía y queda registrado');
  check(await p.locator('#d-where').inputValue()==='',
    'y el formulario queda limpio para el siguiente');

  await br.close(); web.close(); api.server.close(); await api.db.end();
  console.log(`\n${errors.length?'ERRORES JS:\n'+errors.join('\n'):'Errores de JavaScript: 0'}`);
  console.log(fail.length?`\nFALLARON ${fail.length}`:'\nTodas las comprobaciones pasaron.');
  process.exit(fail.length||errors.length?1:0);
})();
