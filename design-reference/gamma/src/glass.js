/* ============================================================
   Capa de interacción compartida.
   Todo respeta prefers-reduced-motion.
   ============================================================ */
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* --- Fondo ambiental -------------------------------------------------
   Manchas de color a la deriva que le dan al vidrio algo que refractar.
   En canvas y no en SVG porque es puramente decorativo y barato de animar. */
function initAmbient(canvas){
  const ctx = canvas.getContext('2d');
  const blobs = [
    { x:.18, y:.20, r:.52, c:[129,20,40],  vx: .000045, vy: .000032 },
    { x:.82, y:.30, r:.44, c:[168,144,48], vx:-.000038, vy: .000047 },
    { x:.55, y:.85, r:.50, c:[20,88,57],   vx: .000030, vy:-.000041 },
    { x:.10, y:.75, r:.34, c:[74,10,23],   vx: .000052, vy:-.000028 },
  ];
  let w, h, raf;

  function size(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.width  = Math.floor(innerWidth  * dpr);
    h = canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
  }

  function draw(t){
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#170609';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    for (const b of blobs){
      // Deriva lenta en trayectoria de Lissajous; se mantiene dentro del lienzo.
      const px = (b.x + Math.sin(t * b.vx) * .12) * w;
      const py = (b.y + Math.cos(t * b.vy) * .12) * h;
      const pr = b.r * Math.max(w, h) * .55;
      const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0,   `rgba(${b.c[0]},${b.c[1]},${b.c[2]},.42)`);
      g.addColorStop(.55, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},.10)`);
      g.addColorStop(1,   `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  size();
  addEventListener('resize', () => { size(); if (REDUCED) draw(0); });

  if (REDUCED){ draw(0); return; }
  (function loop(now){ draw(now); raf = requestAnimationFrame(loop); })(0);
  addEventListener('pagehide', () => cancelAnimationFrame(raf));
}

/* --- Revelado al desplazar ------------------------------------------- */
let revealObserver;
function initReveal(){
  revealObserver = new IntersectionObserver((entries) => {
    for (const e of entries){
      if (e.isIntersecting){
        e.target.classList.add('in');
        revealObserver.unobserve(e.target);
      }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: .06 });
  observeReveals();
}
function observeReveals(root = document){
  if (!revealObserver) return;
  root.querySelectorAll('.reveal:not(.in)').forEach((el, i) => {
    // El índice escalona la entrada; se reinicia en cada render de vista.
    if (!el.style.getPropertyValue('--i')) el.style.setProperty('--i', i % 12);
    revealObserver.observe(el);
  });
}

/* --- Reflejo especular siguiendo al puntero --------------------------- */
function initSheen(){
  document.addEventListener('pointermove', (ev) => {
    const tile = ev.target.closest?.('.glass');
    if (!tile) return;
    const r = tile.getBoundingClientRect();
    tile.style.setProperty('--mx', ((ev.clientX - r.left) / r.width  * 100) + '%');
    tile.style.setProperty('--my', ((ev.clientY - r.top ) / r.height * 100) + '%');
  }, { passive: true });
}

/* --- Ondas al hacer clic ---------------------------------------------- */
function initRipple(){
  document.addEventListener('pointerdown', (ev) => {
    const el = ev.target.closest?.('.btn, .glass-tile.is-clickable, .chip, .nav-btn, .tab-btn');
    if (!el || REDUCED) return;
    const r = el.getBoundingClientRect();
    const d = Math.max(r.width, r.height);
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.width = s.style.height = d + 'px';
    s.style.left = (ev.clientX - r.left - d / 2) + 'px';
    s.style.top  = (ev.clientY - r.top  - d / 2) + 'px';
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    if (getComputedStyle(el).overflow !== 'hidden') s.style.borderRadius = '50%';
    el.appendChild(s);
    setTimeout(() => s.remove(), 640);
  }, { passive: true });
}

/* --- Cuenta ascendente para los KPI ----------------------------------- */
function countUp(el, to, ms = 1100){
  if (REDUCED || to === 0){ el.textContent = to; return; }
  const t0 = performance.now();
  (function step(now){
    const p = Math.min((now - t0) / ms, 1);
    // easeOutExpo: arranca rápido y asienta con suavidad
    const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
    el.textContent = Math.round(to * e);
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}
function initCounters(root = document){
  const io = new IntersectionObserver((entries) => {
    for (const e of entries){
      if (!e.isIntersecting) continue;
      countUp(e.target, Number(e.target.dataset.count || 0));
      io.unobserve(e.target);
    }
  }, { threshold: .4 });
  root.querySelectorAll('[data-count]').forEach((el) => io.observe(el));
}

/* --- Aviso flotante ---------------------------------------------------- */
let toastTimer;
function toast(msg, kind = 'gold'){
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const t = document.createElement('div');
  t.className = 'toast glass';
  t.style.background = kind === 'gold'
    ? 'linear-gradient(140deg,rgba(205,177,73,.92),rgba(168,144,48,.92))'
    : 'linear-gradient(140deg,rgba(62,155,99,.92),rgba(20,88,57,.92))';
  t.style.color = kind === 'gold' ? '#2A1206' : '#F5F0E4';
  t.innerHTML = `<span aria-hidden="true">${kind === 'gold' ? '✦' : '✓'}</span><span>${msg}</span>`;
  t.setAttribute('role', 'status');
  document.body.appendChild(t);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

/* --- Persistencia ------------------------------------------------------
   Los dos prototipos comparten prefijo de clave: si el navegador los sirve
   desde el mismo origen, lo que envía un líder aparece en el panel. Cuando
   no, cada uno conserva su propio estado. La sincronía de verdad es tarea
   del backend en Supabase. */
const STORE_PREFIX = 'gamma.v1.';
function load(key, fallback){
  try{
    const raw = localStorage.getItem(STORE_PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  }catch{ return fallback; }
}
function save(key, value){
  try{ localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value)); }catch{}
}
function clearStore(){
  try{
    Object.keys(localStorage)
      .filter((k) => k.startsWith(STORE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  }catch{}
}

function initGlass(){
  const c = document.getElementById('ambient');
  if (c) initAmbient(c);
  initReveal(); initSheen(); initRipple();
}
