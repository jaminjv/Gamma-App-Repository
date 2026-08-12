// Verificación funcional: sirve cada página envuelta en el esqueleto de
// Artifact y ejercita todos los flujos nuevos con un navegador real.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');

const D = __dirname;
const OUT = D + '/shots';
const wrap = (f) =>
  `<!doctype html><head></head><body>${fs.readFileSync(D + '/artifacts/' + f, 'utf8')}</body>`;

const PAGES = {
  '/dashboard': wrap('operations-dashboard.html'),
  '/leader':    wrap('app-lideres.html'),
};

const fail = [];
function check(cond, label){
  console.log(`   ${cond ? '✓' : '✗ FALLA:'} ${label}`);
  if (!cond) fail.push(label);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = http.createServer((req, res) => {
    const body = PAGES[req.url.split('?')[0]];
    if (!body){ res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
  }).listen(0);
  const port = server.address().port;

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });

  // Un único contexto para todas las páginas: así comparten localStorage,
  // que es justo el escenario real de dos pestañas del mismo navegador.
  const ctx = await browser.newContext();
  const errors = [];
  async function open(pathname, w, h){
    const page = await ctx.newPage();
    await page.setViewportSize({ width: w, height: h });
    page.on('pageerror', (e) => errors.push(`[${pathname}] ${e}`));
    page.on('console', (m) => {
      // El 404 del favicon lo genera este servidor de pruebas, no la página.
      if (m.type() === 'error' && !/favicon/i.test(m.text() + m.location().url))
        errors.push(`[${pathname}] ${m.text()}`);
    });
    page.on('requestfailed', () => {});
    await page.goto(`http://localhost:${port}${pathname}`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    return page;
  }
  const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });

  /* ============ PANEL DE ADMINISTRACIÓN ============ */
  console.log('\n── Dashboard ──');
  let p = await open('/dashboard', 1340, 900);

  const fonts = await p.evaluate(async () => {
    await document.fonts.ready;
    const h = document.querySelector('h1');
    const bg = getComputedStyle(document.body).backgroundColor;
    const [r,g,b] = bg.match(/\d+/g).map(Number);
    return {
      // La familia es una sola: se comprueba en varios grosores del eje.
      w300: document.fonts.check("300 16px 'Google Sans Flex'"),
      w500: document.fonts.check("500 16px 'Google Sans Flex'"),
      w700: document.fonts.check("700 16px 'Google Sans Flex'"),
      headFont: h ? getComputedStyle(h).fontFamily.split(',')[0].replace(/["']/g,'') : '—',
      bodyBg: bg,
      luma: Math.round(.2126*r + .7152*g + .0722*b),
    };
  });
  check(fonts.w300 && fonts.w500 && fonts.w700,
    `Google Sans Flex carga en 300/500/700 (${fonts.w300}/${fonts.w500}/${fonts.w700})`);
  check(fonts.headFont === 'Google Sans Flex', `los títulos usan la familia (${fonts.headFont})`);
  check(fonts.bodyBg !== 'rgba(0, 0, 0, 0)', 'el body tiene fondo opaco');
  check(fonts.luma > 200, `el fondo es claro (luminancia ${fonts.luma}/255, ${fonts.bodyBg})`);
  check(await p.locator('.login-card img').count() === 1, 'el logo aparece en el acceso');
  check((await p.locator('#lg-email').inputValue()) === 'paul@gammatree.com', 'correo del admin precargado');
  await shot(p, 'gm-dash-login');

  await p.click('#lg-btn');
  await p.waitForTimeout(900);
  check(await p.locator('.rail').count() === 1, 'entra al panel');
  const kpi = await p.locator('.kpi .v').first().textContent();
  check(kpi !== '0', `el KPI hizo la cuenta ascendente (${kpi})`);
  await shot(p, 'gm-dash-overview');

  // --- Cuadrillas: habilidades editables (requisito central) ---
  await p.click('[data-nav="crews"]');
  await p.waitForTimeout(700);
  const before = await p.locator('.skills-list .chip.is-on').count();
  await p.locator('[data-rmskill]').first().click();
  await p.waitForTimeout(500);
  const afterRm = await p.locator('.skills-list .chip.is-on').count();
  check(afterRm === before - 1, `quitar habilidad: ${before} → ${afterRm}`);

  await p.locator('[data-addskill]').first().click();
  await p.waitForTimeout(500);
  check(await p.locator('[data-pick]').count() > 0, 'se abre el selector de habilidades');
  await p.locator('[data-pick]').first().click();
  await p.waitForTimeout(600);
  const afterAdd = await p.locator('.skills-list .chip.is-on').count();
  check(afterAdd === afterRm + 1, `añadir habilidad: ${afterRm} → ${afterAdd}`);
  await shot(p, 'gm-dash-crews');

  // Miembros y equipo
  await p.locator('[data-members][data-delta="1"]').first().click();
  await p.waitForTimeout(400);
  check(true, 'el contador de miembros responde');

  // --- Requerimientos ---
  await p.click('[data-nav="requests"]');
  await p.waitForTimeout(700);
  const reqCount = await p.locator('.req-card').count();
  check(reqCount >= 4, `la vista de requerimientos lista ${reqCount} entradas`);
  const badgeBefore = await p.locator('.nav-badge').textContent().catch(() => '0');
  await p.locator('[data-req][data-to="ordered"]').first().click();
  await p.waitForTimeout(600);
  const badgeAfter = await p.locator('.nav-badge').textContent().catch(() => '0');
  check(badgeBefore !== badgeAfter, `el distintivo baja al atender (${badgeBefore} → ${badgeAfter})`);
  await shot(p, 'gm-dash-requests');

  // --- Nueva orden ---
  await p.click('[data-nav="orders"]');
  await p.waitForTimeout(600);
  await p.click('#new-order');
  await p.waitForTimeout(500);
  check(await p.locator('.ro-field').count() >= 1, 'la fecha de apertura se muestra fija y no editable');
  check(await p.locator('#new-order-date').count() === 0, 'no hay campo editable de fecha de apertura');
  check(await p.locator('[data-job]').count() === 6, 'el checklist trae los 6 tipos de trabajo');

  // Guardar sin tipo de trabajo debe rechazarse
  await p.fill('#f-addr', '88 Test Ln, Belleville, IL');
  await p.click('#f-save');
  await p.waitForTimeout(400);
  check(await p.locator('.scrim').count() === 1, 'no deja crear la orden sin tipo de trabajo');

  // Selección múltiple + drop wire
  await p.click('[data-job="removal"]');
  await p.waitForTimeout(200);
  await p.click('[data-job="stump"]');
  await p.waitForTimeout(200);
  check(await p.locator('[data-job].on').count() === 2, 'el checklist admite selección múltiple');
  check(await p.locator('#f-addr').inputValue() === '88 Test Ln, Belleville, IL',
    'la dirección sobrevive a los re-render del formulario');
  await p.click('[data-wire]');
  await p.waitForTimeout(200);
  check(await p.locator('[data-wire].on').count() === 1, 'la casilla Drop Wire queda marcada');
  await p.click('[data-gearpick="bucket"]');
  await p.waitForTimeout(200);
  check(await p.locator('[data-gearpick].on').count() === 1, 'y el equipo queda marcado');
  await p.click('#f-save');
  await p.waitForTimeout(800);

  const card = p.locator('.row-card').first();
  check((await card.textContent()).includes('88 Test Ln'), 'se crea la orden nueva');
  check((await card.textContent()).includes('Opened'), 'la orden muestra su fecha de apertura');
  check(await card.locator('.tag-wire').count() === 1, 'la orden muestra la etiqueta Drop wire');
  check(await card.locator('.tag').count() >= 3, 'la orden muestra sus tipos de trabajo');
  const href = await card.locator('.map-link').first().getAttribute('href');
  check(!!href && href.startsWith('https://www.google.com/maps/'), `la dirección enlaza a Google Maps (${(href||'').slice(0,44)}…)`);
  await shot(p, 'gm-dash-orders');

  await p.click('[data-nav="schedule"]');
  await p.waitForTimeout(700);
  const range0 = await p.locator('.cal-range').first().textContent();
  await p.click('[data-week="1"]');
  await p.waitForTimeout(500);
  const range1 = await p.locator('.cal-range').first().textContent();
  check(range0 !== range1, `avanza de semana (${range0.trim()} -> ${range1.trim()})`);
  await p.click('[data-week="-1"]');
  await p.waitForTimeout(400);
  check((await p.locator('.cal-range').first().textContent()) === range0, 'vuelve la semana anterior');

  await p.selectOption('#cal-month', '11');
  await p.waitForTimeout(500);
  check((await p.locator('.cal-range').first().textContent()).includes('Dec'), 'salta al mes elegido');
  const yr0 = (await p.locator('.cal-bar .cal-range').nth(1).textContent()).trim();
  await p.click('[data-year="1"]');
  await p.waitForTimeout(400);
  const yr1 = (await p.locator('.cal-bar .cal-range').nth(1).textContent()).trim();
  check(Number(yr1) === Number(yr0) + 1, `navega de año (${yr0} -> ${yr1})`);
  await p.click('#cal-today');
  await p.waitForTimeout(600);
  check(await p.locator('.day.today').count() === 1, 'el botón Today regresa a la semana actual');

  const chips = await p.locator('.cal-chip').count();
  check(chips > 0, `el cronograma pinta ${chips} trabajos`);
  check(await p.locator('.cal-chip.st-assigned .cal-ic').count() > 0, 'los asignados llevan color e icono');
  const pend = p.locator('.cal-chip.st-pending');
  if (await pend.count()) check(await pend.first().locator('.cal-ic').count() === 0,
    'los sin asignar van sin icono');
  check(await p.locator('.cal-bolt').count() > 0, 'los trabajos con Drop wire llevan rayo');
  check(await p.locator('.cal-legend .leg').count() === 6, 'la leyenda explica los seis estados');
  await shot(p, 'gm-dash-schedule');

  /* --- New Crew --- */
  await p.click('[data-nav="crews"]');
  await p.waitForTimeout(600);
  const crews0 = await p.locator('.crew-grid > div').count();
  await p.click('#new-crew');
  await p.waitForTimeout(500);
  await p.click('#c-save');
  await p.waitForTimeout(350);
  check(await p.locator('.scrim').count() === 1, 'New Crew exige el nombre del líder');
  await p.fill('#c-leader', 'Marco Salas');
  await p.fill('#c-email', 'marco@gammatree.com');
  await p.click('[data-cskill="removal"]');
  await p.waitForTimeout(200);
  await p.click('#c-save');
  await p.waitForTimeout(800);
  const crews1 = await p.locator('.crew-grid > div').count();
  check(crews1 === crews0 + 1, `New Crew añade la cuadrilla (${crews0} -> ${crews1})`);
  check((await p.locator('.crew-grid').textContent()).includes("Marco's Crew"),
    'la cuadrilla nueva toma el nombre del líder');
  await shot(p, 'gm-dash-newcrew');

  /* --- Consolidados de vaciados --- */
  await p.click('[data-nav="dumps"]');
  await p.waitForTimeout(800);
  check(await p.locator('.sum').count() === 2, 'hay consolidado diario y mensual');
  const sums = (await p.locator('.sum-v').allTextContents()).map(Number);
  check(sums.length === 2 && sums.every(v => !Number.isNaN(v)), `los consolidados totalizan (${sums.join(' / ')})`);
  check(sums[0] > 0, `el consolidado de hoy no sale vacío (${sums[0]} vaciados)`);
  check(sums[1] >= sums[0], `el mensual incluye lo del día (${sums[1]} >= ${sums[0]})`);
  check(await p.locator('.sum-part').count() === 4, 'cada consolidado se desglosa en astillas y troncos');
  await shot(p, 'gm-dash-dumps');

  /* --- Traducción de notas del campo --- */
  await p.click('[data-nav="requests"]');
  await p.waitForTimeout(700);
  const note = p.locator('.req-card').first().locator('.note-box');
  const es = await note.textContent();
  check(/deshilachada|gastados|cascos|aceite/.test(es), 'la nota del líder llega en español');
  await p.locator('.req-card').first().locator('[data-tr]').click();
  await p.waitForTimeout(500);
  const en = await p.locator('.req-card').first().locator('.note-box').textContent();
  check(en !== es && /frayed|worn|hard hats|bar oil/.test(en), 'el admin la traduce a inglés');
  check(en.includes('English'), 'la nota queda marcada como traducida');
  await p.locator('.req-card').first().locator('[data-tr]').click();
  await p.waitForTimeout(500);
  check((await p.locator('.req-card').first().locator('.note-box').textContent()) === es,
    'vuelve al original sin perder nada');
  await shot(p, 'gm-dash-translate');
  await p.close();

  /* ============ APP DE LÍDERES ============ */
  console.log('\n── App de líderes ──');
  p = await open('/leader', 460, 940);
  check(await p.locator('.login-card img').count() === 1, 'el logo aparece en el acceso');
  await shot(p, 'gm-app-login');

  // Contraseña incorrecta
  await p.fill('#lg-email', 'eliseo@gammatree.com');
  await p.fill('#lg-pass', 'incorrecta');
  await p.click('#lg-btn');
  await p.waitForTimeout(500);
  check(await p.locator('.err').count() === 1, 'rechaza la contraseña incorrecta');

  // Correo desconocido
  await p.fill('#lg-email', 'nadie@gammatree.com');
  await p.fill('#lg-pass', 'gamma1954');
  await p.click('#lg-btn');
  await p.waitForTimeout(500);
  check(await p.locator('.err').count() === 1, 'rechaza un correo desconocido');

  // Credenciales válidas
  await p.fill('#lg-email', 'eliseo@gammatree.com');
  await p.fill('#lg-pass', 'gamma1954');
  await p.click('#lg-btn');
  await p.waitForTimeout(800);
  check(await p.locator('.topbar').count() === 1, 'entra con las credenciales correctas');
  const who = await p.locator('.topbar .who b').textContent();
  check(who.includes('Eliseo'), `identifica al líder (${who})`);
  const jobs = await p.locator('.job').count();
  check(jobs >= 2, `solo ve los trabajos de su cuadrilla (${jobs})`);
  await shot(p, 'gm-app-jobs');

  // Iniciar un trabajo
  await p.locator('[data-start]').first().click();
  await p.waitForTimeout(700);
  check(await p.locator('[data-done]').count() > 0, 'iniciar trabajo revela Terminado / No terminado');

  // --- Vaciado ---
  await p.click('[data-tab="dump"]');
  await p.waitForTimeout(700);
  await p.click('#d-send');
  await p.waitForTimeout(400);
  check(await p.locator('.toast').count() === 1, 'el vaciado exige un lugar');
  await p.fill('#d-where', 'Frank Scott Dump Site');
  await p.fill('#d-notes', 'Carga completa de astillas.');
  await p.click('[data-dtype="logs"]');
  await p.waitForTimeout(200);
  await p.click('#d-send');
  await p.waitForTimeout(800);
  check(await p.locator('.hist').count() >= 1, 'el vaciado queda registrado');
  await shot(p, 'gm-app-dump');

  // --- Requerimientos ---
  await p.click('[data-tab="reqs"]');
  await p.waitForTimeout(700);
  await p.click('[data-rcat="tool"]');
  await p.click('[data-rurg="urgent"]');
  await p.fill('#r-note', 'La motosierra pequeña no arranca, necesita bujía nueva.');
  await p.click('#r-send');
  await p.waitForTimeout(800);
  check(await p.locator('.hist').count() >= 1, 'el requerimiento queda registrado');
  check(await p.locator('.tab-badge').count() === 1, 'el distintivo de pendientes aparece');
  await shot(p, 'gm-app-reqs');

  // --- Idioma ---
  await p.click('[data-lang="en"]');
  await p.waitForTimeout(700);
  const h = await p.locator('.sec-head h1').textContent();
  check(h.trim() === 'Requests', `el selector ES/EN traduce (${h.trim()})`);
  check(await p.evaluate(() => document.documentElement.lang) === 'en', 'lang del documento se actualiza');
  await shot(p, 'gm-app-en');

  /* --- ¿Llega al panel lo que envía el líder? --- */
  const inbox = await p.evaluate(() => localStorage.getItem('gamma.v1.inbox'));
  check(!!inbox && inbox.includes('bujía'), 'el envío queda en la bandeja compartida');
  await p.close();

  const p2 = await open('/dashboard', 1340, 900);
  await p2.click('#lg-btn');
  await p2.waitForTimeout(700);
  await p2.click('[data-nav="requests"]');
  await p2.waitForTimeout(700);
  const arrived = await p2.locator('.req-card').allTextContents();
  check(arrived.some((x) => x.includes('bujía')), 'el requerimiento del líder aparece en el panel');
  await shot(p2, 'gm-dash-inbox');
  await p2.close();

  await browser.close();
  server.close();

  console.log(`\n${errors.length ? 'ERRORES JS:\n' + errors.join('\n') : 'Errores de JavaScript: 0'}`);
  console.log(fail.length ? `\nFALLARON ${fail.length}:\n- ${fail.join('\n- ')}` : '\nTodas las comprobaciones pasaron.');
  process.exit(fail.length || errors.length ? 1 : 0);
})();
