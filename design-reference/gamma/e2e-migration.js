/* Base a la que le falta una migración: la app no debe inventarse un éxito,
   no debe perder lo escrito, y debe decir qué falta.
   Es el caso de quien actualiza los archivos y olvida el SQL. */
const { chromium } = require('playwright');
const http=require('http'), fs=require('fs');
const { execSync } = require('child_process');
const mock=require('./mock-supabase');
const D=__dirname, KEY='anon-key-para-pruebas-1234567890';
(async()=>{
  const M='/home/user/Gamma-App-Repository/supabase/migrations';
  const psql=(f)=>execSync(`psql -h /tmp/pgs -U postgres -d gamma_old -v ON_ERROR_STOP=1 -q -f ${f} 2>&1`).toString();
  execSync(`psql -h /tmp/pgs -U postgres -tAc "drop database if exists gamma_old" 2>&1`);
  execSync(`psql -h /tmp/pgs -U postgres -tAc "create database gamma_old" 2>&1`);
  psql(D+'/00_shim.sql');
  // A propósito: hasta 0006 nada más.
  for(const m of ['0001_init.sql','0003_fix_role_escalation.sql','0004_gamma_model.sql',
                  '0005_client_ready.sql','0006_deletable.sql']) psql(`${M}/${m}`);
  execSync(`psql -h /tmp/pgs -U postgres -d gamma_old -q -c "
    grant usage on schema public, auth, storage to app_user;
    grant select,insert,update,delete on all tables in schema public to app_user;
    grant execute on all functions in schema public to app_user;
    insert into auth.users (id,email,raw_user_meta_data) values
      ('a0000000-0000-0000-0000-000000000001','paul@gammatree.com','{\\"full_name\\":\\"Paul\\"}');
    update profiles set role='admin' where email='paul@gammatree.com';
    insert into groups (name,leader_name,leader_email,equipment_type,member_count)
      values ('Eliseo''s Crew','Eliseo','eliseo@gammatree.com','climbing',4);" 2>&1`);

  const api=await mock.start('postgresql://postgres@/gamma_old?host=/tmp/pgs');
  const b=fs.readFileSync(D+'/artifacts/operations-dashboard.html','utf8');
  const web=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    r.end(`<!doctype html><head></head><body>${b}</body>`);});
  await new Promise(r=>web.listen(0,r)); const W=web.address().port;
  const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await br.newPage({viewport:{width:1340,height:900}});
  await p.goto(`http://localhost:${W}/`); await p.waitForTimeout(400);
  await p.click('#cfg-btn'); await p.waitForTimeout(300);
  await p.fill('#cf-url',`http://localhost:${api.port}`); await p.fill('#cf-key',KEY);
  await p.click('#cf-save'); await p.waitForTimeout(900);
  await p.fill('#lg-email','paul@gammatree.com'); await p.fill('#lg-pass','gamma1954');
  await p.click('#lg-btn'); await p.waitForTimeout(1500);

  await p.click('[data-nav="orders"]'); await p.waitForTimeout(600);
  await p.click('#new-order'); await p.waitForTimeout(400);
  await p.fill('#f-addr','1 Repro St, Belleville, IL');
  await p.click('[data-job="removal"]'); await p.waitForTimeout(120);
  await p.click('[data-gearpick="bucket"]'); await p.waitForTimeout(120);
  await p.click('#f-save'); await p.waitForTimeout(2500);

  const fail=[]; const check=(c,l)=>{console.log(`   ${c?'✓':'✗ FALLA:'} ${l}`); if(!c) fail.push(l);};
  const enBase=(await api.db.query("select count(*)::int n from work_orders")).rows[0].n;
  check(enBase===0, 'la orden no se guarda, como debe ser');
  check(await p.locator('.toast').count()===0, 'y no se anuncia un éxito que no ocurrió');
  check(await p.locator('.scrim').count()>0, 'el formulario sigue abierto');
  check(await p.locator('#f-addr').inputValue()==='1 Repro St, Belleville, IL',
    'con todo lo escrito intacto');
  const err=await p.locator('.modal .err').count()
    ? (await p.locator('.modal .err').textContent()).replace(/\s+/g,' ') : '';
  check(/missing a migration/i.test(err), 'y explica que falta una migración');
  check(/gear/.test(err), 'nombrando la columna que falta');
  check(/0007/.test(err), 'y el archivo que hay que correr');
  await p.screenshot({path:D+'/shots/repro-0007.png'});
  await br.close(); web.close(); api.server.close(); await api.db.end();
  console.log(fail.length?`\nFALLARON ${fail.length}`:'\nTodas las comprobaciones pasaron.');
  process.exit(fail.length?1:0);
})();
