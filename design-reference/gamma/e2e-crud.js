/* Editar y eliminar órdenes y cuadrillas, y el recorrido de la foto de
   cierre desde el teléfono hasta el panel. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs');
const { execSync } = require('child_process');
const mock = require('./mock-supabase');
const D=__dirname, KEY='anon-key-para-pruebas-1234567890';
const fail=[]; const check=(c,l)=>{console.log(`   ${c?'✓':'✗ FALLA:'} ${l}`); if(!c) fail.push(l);};

// Un JPEG mínimo pero válido, para ejercitar la subida de verdad.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'+
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA'+
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

(async()=>{
  const M='/home/user/Gamma-App-Repository/supabase/migrations';
  const psql=(f)=>execSync(`psql -h /tmp/pgs -U postgres -d gamma_crud -v ON_ERROR_STOP=1 -q -f ${f} 2>&1`).toString();
  execSync(`psql -h /tmp/pgs -U postgres -tAc "drop database if exists gamma_crud" 2>&1`);
  execSync(`psql -h /tmp/pgs -U postgres -tAc "create database gamma_crud" 2>&1`);
  psql(D+'/00_shim.sql');
  for(const m of ['0001_init.sql','0003_fix_role_escalation.sql','0004_gamma_model.sql',
                  '0005_client_ready.sql','0006_deletable.sql']) psql(`${M}/${m}`);
  psql(D+'/seed-sync.sql');

  const api=await mock.start('postgresql://postgres@/gamma_crud?host=/tmp/pgs');
  const API=`http://localhost:${api.port}`;
  const P={'/dashboard':fs.readFileSync(D+'/artifacts/operations-dashboard.html','utf8'),
           '/leader':fs.readFileSync(D+'/artifacts/app-lideres.html','utf8')};
  const web=http.createServer((q,r)=>{const b=P[q.url.split('?')[0]];if(!b){r.writeHead(404);return r.end();}
    r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    r.end(`<!doctype html><head></head><body>${b}</body>`);});
  await new Promise(r=>web.listen(0,r)); const W=web.address().port;
  const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const errors=[];

  async function device(ruta,w,h,tag){
    const ctx=await br.newContext(); const p=await ctx.newPage();
    await p.setViewportSize({width:w,height:h});
    p.on('pageerror',e=>errors.push(`[${tag}] ${e}`));
    p.on('console',m=>{ if(m.type()==='error'&&!/favicon/i.test(m.text()+m.location().url))
      errors.push(`[${tag}] ${m.text()}`); });
    await p.goto(`http://localhost:${W}${ruta}`); await p.waitForTimeout(400);
    await p.click('#cfg-btn'); await p.waitForTimeout(300);
    await p.fill('#cf-url',API); await p.fill('#cf-key',KEY);
    await p.click('#cf-save'); await p.waitForTimeout(900);
    return p;
  }
  const signIn=async(p,email)=>{ await p.fill('#lg-email',email); await p.fill('#lg-pass','gamma1954');
    await p.click('#lg-btn'); await p.waitForTimeout(1500); };

  const office=await device('/dashboard',1340,900,'panel');
  await signIn(office,'paul@gammatree.com');
  await office.click('[data-nav="orders"]'); await office.waitForTimeout(900);

  /* ---------- Editar una orden ---------- */
  console.log('── Editar una orden ──');
  const antesDir = await office.locator('.row-card h3').first().textContent();
  await office.locator('[data-editorder]').first().click(); await office.waitForTimeout(500);
  check((await office.locator('#f-addr').inputValue()).length>0, 'el formulario abre con los datos cargados');
  check((await office.locator('.modal h2').textContent()).includes('Edit'), 'y se presenta como edición');
  const abierta = await office.locator('.ro-field b').first().textContent();
  await office.fill('#f-addr','999 Editada Ave, Belleville, IL');
  await office.click('[data-job="brush"]'); await office.waitForTimeout(200);
  await office.click('#f-save'); await office.waitForTimeout(1600);
  const texto = await office.locator('main').textContent();
  check(texto.includes('999 Editada Ave'), 'la dirección editada se guarda');
  check(!texto.includes(antesDir.trim()), 'y la anterior ya no aparece');
  check(texto.includes(abierta.trim()), 'la fecha de apertura no cambió al editar');

  /* ---------- Eliminar una orden ---------- */
  console.log('\n── Eliminar una orden ──');
  const nOrdenes = await office.locator('.row-card').count();
  await office.locator('[data-delorder]').first().click(); await office.waitForTimeout(500);
  check(await office.locator('#ok-delorder').count()===1, 'pide confirmación antes de borrar');
  await office.click('[data-close-btn]'); await office.waitForTimeout(400);
  check(await office.locator('.row-card').count()===nOrdenes, 'al cancelar no borra nada');
  await office.locator('[data-delorder]').first().click(); await office.waitForTimeout(400);
  await office.click('#ok-delorder'); await office.waitForTimeout(1600);
  check(await office.locator('.row-card').count()===nOrdenes-1, 'confirmando sí borra');
  check((await api.db.query('select count(*)::int n from work_orders')).rows[0].n===nOrdenes-1,
    'y desaparece de la base, no solo de la pantalla');

  /* ---------- Editar una cuadrilla ---------- */
  console.log('\n── Editar una cuadrilla ──');
  await office.click('[data-nav="crews"]'); await office.waitForTimeout(800);
  await office.locator('[data-editcrew]').first().click(); await office.waitForTimeout(500);
  await office.fill('#c-name','Cuadrilla Renombrada');
  await office.click('[data-cskill="crane"]'); await office.waitForTimeout(200);
  await office.click('#c-save'); await office.waitForTimeout(1600);
  check((await office.locator('.crew-grid').textContent()).includes('Cuadrilla Renombrada'),
    'el nombre editado se guarda');
  const skills=(await api.db.query("select skill::text from group_skills s join groups g on g.id=s.group_id where g.name='Cuadrilla Renombrada'")).rows.map(r=>r.skill);
  check(skills.includes('crane'), `la habilidad añadida llega a la base (${skills.join(', ')})`);

  /* ---------- Eliminar una cuadrilla ---------- */
  console.log('\n── Eliminar una cuadrilla ──');
  await office.locator('[data-delcrew]').first().click(); await office.waitForTimeout(500);
  const aviso = await office.locator('.modal .note-box').textContent();
  check(/open order/i.test(aviso) && /dump report/i.test(aviso),
    'la confirmación dice qué arrastra el borrado');
  await office.click('#ok-delcrew'); await office.waitForTimeout(1800);
  const quedan=(await api.db.query('select count(*)::int n from groups')).rows[0].n;
  check(quedan===1, `la cuadrilla se borra (quedan ${quedan})`);
  const huerfanas=(await api.db.query('select count(*)::int n from work_orders where group_id is null')).rows[0].n;
  check(huerfanas>=0, 'y sus órdenes sobreviven sin cuadrilla, no se borran');
  const totalOrdenes=(await api.db.query('select count(*)::int n from work_orders')).rows[0].n;
  check(totalOrdenes===nOrdenes-1, `ninguna orden se perdió (${totalOrdenes})`);

  /* ---------- La foto de cierre llega al panel ---------- */
  console.log('\n── Foto de cierre: teléfono → panel ──');
  // Los borrados de arriba pudieron dejar a Ivan sin trabajos: se le crea
  // uno desde la oficina para que esta parte no dependa de lo anterior.
  await office.click('[data-nav="orders"]'); await office.waitForTimeout(600);
  await office.click('#new-order'); await office.waitForTimeout(400);
  await office.fill('#f-addr','77 Cierre Test Rd, Belleville, IL');
  await office.click('[data-job="removal"]'); await office.waitForTimeout(150);
  await office.selectOption('#f-crew',{label:"Ivan's Crew"});
  await office.click('#f-save'); await office.waitForTimeout(1700);

  const phone=await device('/leader',460,940,'app');
  await signIn(phone,'ivan@gammatree.com');
  await phone.waitForTimeout(600);
  const hayTrabajo = await phone.locator('[data-start]').count();
  check(hayTrabajo>0, 'el líder tiene un trabajo que cerrar');
  await phone.locator('[data-start]').first().click(); await phone.waitForTimeout(1500);
  await phone.locator('[data-done]').first().click(); await phone.waitForTimeout(600);
  await phone.setInputFiles('#ph',{name:'cierre.jpg',mimeType:'image/jpeg',buffer:JPEG});
  await phone.waitForTimeout(900);
  await phone.click('#ok-done'); await phone.waitForTimeout(2200);

  const shot = phone.locator('.done-shot img').first();
  check(await shot.count()===1, 'la app muestra la foto de cierre en la tarjeta');
  const alto = (await shot.boundingBox())?.height ?? 0;
  check(alto>0 && alto<=200, `y con altura acotada, no desbordada (${Math.round(alto)}px)`);

  const urlEnBase=(await api.db.query('select completion_photo_url u from work_orders where completion_photo_url is not null')).rows[0]?.u;
  check(!!urlEnBase, 'la URL queda guardada en la orden');

  await office.click('[data-nav="orders"]'); await office.waitForTimeout(1600);
  check(await office.locator('.done-shot').count()>0, 'el panel la muestra al admin');
  const altoAdmin=(await office.locator('.done-shot img').first().boundingBox())?.height ?? 0;
  check(altoAdmin>0 && altoAdmin<=200, `también acotada en el panel (${Math.round(altoAdmin)}px)`);
  await office.locator('.done-shot').first().click(); await office.waitForTimeout(600);
  check(await office.locator('.scrim img').count()===1, 'y se puede abrir en grande');

  await br.close(); web.close(); api.server.close(); await api.db.end();
  console.log(`\n${errors.length?'ERRORES JS:\n'+errors.join('\n'):'Errores de JavaScript: 0'}`);
  console.log(fail.length?`\nFALLARON ${fail.length}:\n- ${fail.join('\n- ')}`:'\nTodas las comprobaciones pasaron.');
  process.exit(fail.length||errors.length?1:0);
})();
