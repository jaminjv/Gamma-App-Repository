/* ============================================================
   Prueba de extremo a extremo del modo conectado.
   Panel y app corren en CONTEXTOS DE NAVEGADOR SEPARADOS —sin localStorage
   compartido— contra una base Postgres real con RLS activo. Es el escenario
   de la oficina y el teléfono, no dos pestañas del mismo navegador.
   ============================================================ */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const { execSync } = require('child_process');
const mock = require('./mock-supabase');

const D = __dirname;
const CONN = 'postgresql://postgres@/gamma_sync?host=/tmp/pgs';
const KEY = 'anon-key-para-pruebas-1234567890';

const fail = [];
const check = (c, label) => { console.log(`   ${c ? '✓' : '✗ FALLA:'} ${label}`); if (!c) fail.push(label); };

const wrap = (f) =>
  `<!doctype html><head></head><body>${fs.readFileSync(D + '/artifacts/' + f, 'utf8')}</body>`;

(async () => {
  /* ---------- Base limpia con las cinco migraciones ---------- */
  const M = '/home/user/Gamma-App-Repository/supabase/migrations';
  const psql = (db, file) =>
    execSync(`psql -h /tmp/pgs -U postgres -d ${db} -v ON_ERROR_STOP=1 -q -f ${file} 2>&1`).toString();
  execSync(`psql -h /tmp/pgs -U postgres -tAc "drop database if exists gamma_sync" 2>&1`);
  execSync(`psql -h /tmp/pgs -U postgres -tAc "create database gamma_sync" 2>&1`);
  for (const f of ['00_shim.sql', null, null, null, null]) void f;
  psql('gamma_sync', D + '/00_shim.sql');
  for (const m of ['0001_init.sql', '0003_fix_role_escalation.sql', '0004_gamma_model.sql', '0005_client_ready.sql', '0006_deletable.sql'])
    psql('gamma_sync', `${M}/${m}`);
  psql('gamma_sync', D + '/seed-sync.sql');
  console.log('   base preparada con las migraciones reales\n');

  /* ---------- Servidores ---------- */
  const api = await mock.start(CONN);
  const PAGES = { '/dashboard': wrap('operations-dashboard.html'), '/leader': wrap('app-lideres.html') };
  const web = http.createServer((req, res) => {
    const b = PAGES[req.url.split('?')[0]];
    if (!b){ res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(b);
  });
  await new Promise((r) => web.listen(0, r));
  const webPort = web.address().port;
  const API = `http://localhost:${api.port}`;

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });
  const errors = [];

  // Un contexto por dispositivo: no comparten almacenamiento.
  async function device(path, w, h, label){
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.setViewportSize({ width: w, height: h });
    page.on('pageerror', (e) => errors.push(`[${label}] ${e}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon/i.test(m.text() + m.location().url))
        errors.push(`[${label}] ${m.text()}`);
    });
    await page.goto(`http://localhost:${webPort}${path}`);
    await page.waitForTimeout(500);
    return page;
  }

  async function connect(page){
    await page.click('#cfg-btn');
    await page.waitForTimeout(400);
    await page.fill('#cf-url', API);
    await page.fill('#cf-key', KEY);
    await page.click('#cf-save');
    await page.waitForTimeout(900);
  }
  async function signIn(page, email){
    await page.fill('#lg-email', email);
    await page.fill('#lg-pass', 'gamma1954');
    await page.click('#lg-btn');
    await page.waitForTimeout(1400);
  }

  console.log('── Oficina: conectar y entrar ──');
  const office = await device('/dashboard', 1340, 900, 'panel');
  await connect(office);
  check(await office.locator('.conn-on').count() > 0, 'el panel queda conectado al backend');
  await signIn(office, 'paul@gammatree.com');
  check(await office.locator('.rail').count() === 1, 'el admin entra con su cuenta de Supabase');
  const seenOrders = await office.locator('.kpi .v').first().textContent();
  check(Number(seenOrders) > 0, `el panel lee las órdenes del servidor (${seenOrders} hoy)`);

  console.log('\n── Teléfono: otro dispositivo, otra sesión ──');
  const phone = await device('/leader', 460, 940, 'app');
  await connect(phone);
  await signIn(phone, 'eliseo@gammatree.com');
  check(await phone.locator('.topbar').count() === 1, 'el líder entra con su propia cuenta');
  const crew = await phone.locator('.topbar .who span').textContent();
  check(crew.includes('Eliseo'), `la cuadrilla la resuelve la base, no una lista local (${crew})`);
  const jobsBefore = await phone.locator('.job').count();
  check(jobsBefore > 0, `el líder ve ${jobsBefore} trabajos de su cuadrilla`);

  /* ---------- A. Oficina -> teléfono ---------- */
  console.log('\n── A. La oficina crea una orden y el teléfono la recibe ──');
  await office.click('[data-nav="orders"]');
  await office.waitForTimeout(500);
  await office.click('#new-order');
  await office.waitForTimeout(400);
  await office.fill('#f-addr', '1200 Sync Test Rd, Belleville, IL');
  await office.click('[data-job="removal"]');
  await office.waitForTimeout(150);
  await office.click('[data-wire]');
  await office.waitForTimeout(150);
  await office.selectOption('#f-crew', { label: "Eliseo's Crew" });
  await office.fill('#f-notes', 'Created from the office to test live sync.');
  await office.click('#f-save');
  await office.waitForTimeout(1500);
  check((await office.locator('main').textContent()).includes('1200 Sync Test Rd'),
    'la orden se guarda en el servidor y vuelve al panel');
  check((await office.locator('.row-card').first().textContent()).includes('1200 Sync Test Rd'),
    'y aparece primero: dentro del mismo día manda lo recién creado');

  // El teléfono no hace nada: solo espera su sondeo.
  await phone.waitForTimeout(9000);
  const phoneText = await phone.locator('.body').textContent();
  check(phoneText.includes('1200 Sync Test Rd'), 'el teléfono recibe la orden sin que nadie lo recargue');
  check(await phone.locator('.tag-wire').count() > 0, 'el retiro de cable llega marcado al teléfono');

  /* ---------- B. Teléfono -> oficina ---------- */
  console.log('\n── B. El líder reporta y la oficina lo ve ──');
  await phone.click('[data-tab="reqs"]');
  await phone.waitForTimeout(500);
  await phone.click('[data-rcat="rope"]');
  await phone.click('[data-rurg="urgent"]');
  await phone.fill('#r-note', 'La cuerda de escalada se dañó en el trabajo de hoy.');
  await phone.click('#r-send');
  await phone.waitForTimeout(1500);
  check((await phone.locator('.hist').first().textContent()).includes('cuerda'),
    'el requerimiento queda registrado en el servidor');

  await office.click('[data-nav="requests"]');
  await office.waitForTimeout(1200);
  const reqText = await office.locator('main').textContent();
  check(reqText.includes('se dañó en el trabajo'), 'la oficina ve el requerimiento del líder');
  check(reqText.includes("Eliseo's Crew"), 'atribuido a la cuadrilla correcta');

  // Y se puede traducir, que es contenido llegado del servidor.
  await office.locator('.req-card').first().locator('[data-tr]').click();
  await office.waitForTimeout(500);
  check(/rope|climbing/i.test(await office.locator('.req-card').first().textContent()),
    'la traducción funciona sobre datos del servidor');

  /* ---------- C. Cierre de trabajo con RPC protegida ---------- */
  console.log('\n── C. El líder cierra un trabajo ──');
  await phone.click('[data-tab="jobs"]');
  await phone.waitForTimeout(600);
  await phone.locator('[data-start]').first().click();
  await phone.waitForTimeout(1500);
  check(await phone.locator('[data-done]').count() > 0, 'iniciar el trabajo pasa por la función protegida');

  const dbState = await api.db.query(
    "select state from work_orders where state='progress' and group_id=(select id from groups where name like 'Eliseo%')");
  check(dbState.rows.length > 0, 'la base registra el cambio de estado');

  await office.click('[data-nav="orders"]');
  await office.waitForTimeout(1200);
  check((await office.locator('main').textContent()).includes('In progress'),
    'la oficina ve el trabajo en progreso');

  /* ---------- D. Vaciado y consolidados ---------- */
  console.log('\n── D. Vaciado del campo y consolidado en la oficina ──');
  await phone.click('[data-tab="dump"]');
  await phone.waitForTimeout(500);
  await phone.fill('#d-where', 'Frank Scott Dump Site');
  await phone.fill('#d-notes', 'Carga completa de astillas.');
  await phone.click('#d-send');
  await phone.waitForTimeout(1500);

  await office.click('[data-nav="dumps"]');
  await office.waitForTimeout(1200);
  const dumpText = await office.locator('main').textContent();
  check(dumpText.includes('Frank Scott Dump Site'), 'el vaciado llega a la oficina');
  const today = Number(await office.locator('.sum-v').first().textContent());
  check(today >= 1, `el consolidado del día lo cuenta (${today})`);

  /* ---------- E. Aislamiento entre cuadrillas ---------- */
  console.log('\n── E. RLS: un líder no ve lo de otra cuadrilla ──');
  const other = await device('/leader', 460, 940, 'app-ivan');
  await connect(other);
  await signIn(other, 'ivan@gammatree.com');
  const ivanText = await other.locator('.body').textContent();
  check(!ivanText.includes('1200 Sync Test Rd'),
    'Ivan no ve la orden asignada a la cuadrilla de Eliseo');
  const ivanJobs = await other.locator('.job').count();
  check(ivanJobs > 0, `pero sí ve las suyas (${ivanJobs})`);

  await browser.close();
  web.close(); api.server.close(); await api.db.end();

  console.log(`\n${errors.length ? 'ERRORES JS:\n' + errors.join('\n') : 'Errores de JavaScript: 0'}`);
  console.log(fail.length ? `\nFALLARON ${fail.length}:\n- ${fail.join('\n- ')}` : '\nTodas las comprobaciones pasaron.');
  process.exit(fail.length || errors.length ? 1 : 0);
})();
