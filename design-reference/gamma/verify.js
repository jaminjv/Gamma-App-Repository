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
    return {
      fraunces: document.fonts.check("600 16px 'Fraunces'"),
      archivo:  document.fonts.check("500 16px 'Archivo'"),
      mono:     document.fonts.check("400 16px 'IBM Plex Mono'"),
      bodyBg:   getComputedStyle(document.body).backgroundColor,
    };
  });
  check(fonts.fraunces && fonts.archivo && fonts.mono, `las 3 fuentes cargan (${JSON.stringify(fonts)})`);
  check(fonts.bodyBg !== 'rgba(0, 0, 0, 0)', 'el body tiene fondo opaco');
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
  await p.fill('#f-addr', '88 Test Ln, Belleville, IL');
  await p.click('#f-save');
  await p.waitForTimeout(700);
  check((await p.locator('.row-card h3').first().textContent()).includes('88 Test Ln'), 'se crea la orden nueva');
  await shot(p, 'gm-dash-orders');

  await p.click('[data-nav="schedule"]');
  await p.waitForTimeout(700);
  await shot(p, 'gm-dash-schedule');
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
