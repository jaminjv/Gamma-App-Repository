/* ============================================================
   GAMMA — capa de datos
   Dos modos, misma interfaz para las dos aplicaciones:
     · local  — sin configurar: todo vive en localStorage (modo demostración)
     · nube   — configurado: habla con Supabase por REST, y entonces los
                datos sí viajan entre la oficina y los teléfonos
   Se elige solo según haya o no configuración guardada.

   Aviso: dentro de un artifact publicado el modo nube no puede funcionar,
   porque ese entorno bloquea toda petición a hosts externos. Sirve al
   abrir el archivo localmente o al servirlo desde tu propio hosting.
   ============================================================ */
const Gamma = {
  cfg: load('cfg', null),          // {url, key}
  session: load('session', null),  // {access_token, refresh_token, user}

  online(){ return !!(this.cfg && this.cfg.url && this.cfg.key); },
  signedIn(){ return !!(this.session && this.session.access_token); },

  configure(url, key){
    this.cfg = { url: normalizeUrl(url), key: String(key).trim() };
    save('cfg', this.cfg);
  },
  disconnect(){
    this.cfg = null; this.session = null;
    save('cfg', null); save('session', null);
  },

  headers(extra){
    const h = {
      apikey: this.cfg.key,
      Authorization: 'Bearer ' + (this.session?.access_token || this.cfg.key),
      'Content-Type': 'application/json',
      ...extra,
    };
    return h;
  },

  /* --- Autenticación --------------------------------------------------- */
  async signIn(email, password){
    const r = await fetch(`${this.cfg.url}/auth/v1/token?grant_type=password`, {
      method:'POST',
      headers:{ apikey:this.cfg.key, 'Content-Type':'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(body.error_description || body.msg || body.message || 'No se pudo iniciar sesión');
    this.session = body; save('session', body);
    return body.user;
  },
  async signOut(){
    try{
      if(this.session) await fetch(`${this.cfg.url}/auth/v1/logout`, {
        method:'POST', headers:this.headers(),
      });
    }catch{}
    this.session = null; save('session', null);
  },
  // Renueva el token cuando caduca; sin esto la sesión muere a la hora.
  async refresh(){
    if(!this.session?.refresh_token) return false;
    const r = await fetch(`${this.cfg.url}/auth/v1/token?grant_type=refresh_token`, {
      method:'POST',
      headers:{ apikey:this.cfg.key, 'Content-Type':'application/json' },
      body: JSON.stringify({ refresh_token:this.session.refresh_token }),
    });
    if(!r.ok){ this.session=null; save('session',null); return false; }
    this.session = await r.json(); save('session', this.session);
    return true;
  },

  /* --- REST ------------------------------------------------------------ */
  async rest(path, opts = {}, retry = true){
    const r = await fetch(`${this.cfg.url}/rest/v1/${path}`, {
      ...opts,
      headers: this.headers(opts.headers),
    });
    if(r.status === 401 && retry && await this.refresh()) return this.rest(path, opts, false);
    if(!r.ok){
      const e = await r.json().catch(()=>({}));
      throw new Error(e.message || e.hint || `${r.status} en ${path}`);
    }
    return r.status === 204 ? null : r.json();
  },
  get(path){ return this.rest(path); },
  insert(table, row){
    return this.rest(table, {
      method:'POST',
      headers:{ Prefer:'return=representation' },
      body: JSON.stringify(row),
    });
  },
  patch(table, id, changes){
    return this.rest(`${table}?id=eq.${id}`, {
      method:'PATCH',
      headers:{ Prefer:'return=representation' },
      body: JSON.stringify(changes),
    });
  },
  remove(table, query){ return this.rest(`${table}?${query}`, { method:'DELETE' }); },
  rpc(fn, args){
    return this.rest(`rpc/${fn}`, { method:'POST', body: JSON.stringify(args) });
  },

  /* --- Storage ---------------------------------------------------------
     Las fotos van al bucket y a la fila solo su URL: guardar el data URI
     en una columna hincha cada consulta con megabytes de imagen. */
  async upload(bucket, name, dataUrl){
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2,7)}-${name}`;
    const r = await fetch(`${this.cfg.url}/storage/v1/object/${bucket}/${path}`, {
      method:'POST',
      headers:{
        apikey:this.cfg.key,
        Authorization:'Bearer ' + (this.session?.access_token || this.cfg.key),
        'Content-Type': blob.type || 'image/jpeg',
      },
      body: blob,
    });
    if(!r.ok) throw new Error('No se pudo subir la imagen');
    return `${this.cfg.url}/storage/v1/object/public/${bucket}/${path}`;
  },
};

/* Normaliza lo que sea que hayan pegado.
   Copiar del panel de Supabase arrastra espacios y saltos de línea, y mucha
   gente pega la URL ya con el sufijo de la API. Cualquiera de esas tres cosas
   produce una ruta con doble barra o duplicada, y Supabase responde
   "Invalid path specified in request URL", que no dice dónde mirar. */
function normalizeUrl(raw){
  let u = String(raw).trim();
  u = u.replace(/^[<"'\s]+|[>"'\s]+$/g, '');       // comillas y espacios pegados
  u = u.replace(/\/(rest|auth|storage)\/v\d+\/?.*$/i, '');  // sufijo de la API
  u = u.replace(/\/+$/, '');                        // barras finales
  if(u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

/* Revisa la forma de la URL antes de gastar una petición, y devuelve el
   motivo concreto cuando no puede ser la del proyecto. */
function urlProblem(raw){
  const u = normalizeUrl(raw);
  if(!u) return 'EMPTY';
  let host;
  try{ host = new URL(u).hostname; }catch{ return 'MALFORMED'; }
  if(/supabase\.(com|green)$/i.test(host)) return 'DASHBOARD';   // el panel, no el proyecto
  if(/^(localhost|127\.|\[)/.test(host)) return null;            // desarrollo local
  if(!/supabase\.(co|in)$/i.test(host) && !host.includes('.')) return 'MALFORMED';
  return null;
}

/* --- Repintado seguro ------------------------------------------------
   Volver a dibujar la pantalla cada 8 segundos tiene dos efectos que nadie
   pidió: borra lo que la persona está escribiendo en un formulario que no
   es modal, y reproduce otra vez todas las animaciones de entrada, de modo
   que la aplicación parece recargarse sola aunque no haya cambiado nada. */

// ¿El cursor está dentro de un campo? Entonces no se toca la pantalla.
function isTyping(){
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
                  el.tagName === 'SELECT' || el.isContentEditable);
}

// Firma barata de lo que vino del servidor: si no cambió, no se repinta.
function snapshotSig(st){
  return JSON.stringify([
    (st.orders   || []).map(o => [o.id, o.status, o.date, o.crew, o.dropWire]),
    (st.jobs     || []).map(j => [j.id, j.status, j.date]),
    (st.dumps    || []).map(d => d.id),
    (st.requests || []).map(r => [r.id, r.status]),
    (st.crews    || []).map(c => [c.id, c.members, c.gear, (c.skills || []).join()]),
  ]);
}

/* Diagnóstico de conexión.
   Un fallo de red y una URL mal escrita se ven igual desde JavaScript, pero
   el remedio es opuesto: decirle a alguien "revisa la URL" cuando lo que
   pasa es que el entorno bloquea toda salida lo manda a buscar donde no es. */
function connectionHint(err){
  const blocked = /failed to fetch|networkerror|load failed|not allowed/i.test(err?.message || '');
  const sandboxed = (() => { try { return window.self !== window.top; } catch { return true; } })();
  if(blocked && sandboxed) return 'SANDBOX';
  if(blocked) return 'NET';
  return null;
}

/* ============================================================
   Traducción entre las filas de la base y la forma que usan las apps
   ============================================================ */
// El tipo de equipo de la CUADRILLA sigue siendo uno solo; el de la ORDEN
// pasó a ser una lista. Son dos vocabularios distintos a propósito.
const GEAR_TO_DB   = { bucket:'bucket', climbing:'climbing', both:'ambos' };
const GEAR_FROM_DB = { bucket:'bucket', climbing:'climbing', ambos:'both' };

// La posición en el mapa es decorativa y no está en la base: se deriva del
// id para que cada cuadrilla caiga siempre en el mismo punto.
function pinFor(id){
  let h = 0;
  for(const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { x: 15 + (h % 70), y: 20 + ((h >> 8) % 60) };
}

const Map2 = {
  orderFromRow(r, photos){
    return {
      id:r.id, address:r.address,
      createdAt: Date.parse(r.created_at),
      date: r.scheduled_date,
      jobs: r.job_types || [],
      gears: r.gear || [],
      custName: r.customer_name || '',
      custPhone: r.customer_phone || '',
      dropWire: !!r.drop_wire,
      notes: r.instructions || '',
      status: r.state,
      crew: r.group_id,
      sketch: r.sketch_image_url || null,
      flagReason: r.reassign_reason || null,
      photo: r.completion_photo_url || null,
      photos: (photos || []).filter(p => p.work_order_id === r.id).map(p => p.url),
    };
  },
  orderToRow(o){
    return {
      address:o.address, scheduled_date:o.date, job_types:o.jobs,
      gear: o.gears || [],
      customer_name: o.custName || null,
      customer_phone: o.custPhone || null,
      drop_wire: !!o.dropWire, instructions:o.notes || null,
      state:o.status, group_id:o.crew || null,
      sketch_image_url:o.sketch || null,
    };
  },
  crewFromRow(r, skills){
    return {
      id:r.id, name:r.name,
      leader: r.leader_name || '—',
      email: r.leader_email || '',
      gear: GEAR_FROM_DB[r.equipment_type] || 'bucket',
      members: r.member_count,
      skills: (skills || []).filter(s => s.group_id === r.id).map(s => s.skill),
      ...pinFor(r.id),
    };
  },
  crewToRow(c){
    return {
      name:c.name, leader_name:c.leader, leader_email:c.email,
      equipment_type: GEAR_TO_DB[c.gear] || 'bucket', member_count:c.members,
    };
  },
  dumpFromRow(r){
    return { id:r.id, crew:r.group_id, location:r.location_name,
             type:r.dump_type, notes:r.notes || '', at:Date.parse(r.reported_at) };
  },
  dumpToRow(d){
    return { group_id:d.crew, location_name:d.location, dump_type:d.type,
             notes:d.notes || null };
  },
  reqFromRow(r){
    return { id:r.id, crew:r.group_id, cat:r.category, urgency:r.urgency,
             note:r.note, at:Date.parse(r.created_at), status:r.state };
  },
  reqToRow(r){
    return { group_id:r.crew, category:r.cat, urgency:r.urgency, note:r.note };
  },
};

/* ============================================================
   Lectura completa. RLS decide qué ve cada quien: el admin lo ve todo y
   el líder solo lo de su cuadrilla, sin que el cliente filtre nada.
   ============================================================ */
async function pullAll(){
  const [groups, skills, orders, photos, dumps, requests] = await Promise.all([
    Gamma.get('groups?select=*&order=name.asc'),
    Gamma.get('group_skills?select=*'),
    Gamma.get('work_orders?select=*&order=scheduled_date.asc,created_at.desc'),
    Gamma.get('work_order_photos?select=*'),
    Gamma.get('dump_reports?select=*&order=reported_at.desc'),
    Gamma.get('equipment_requests?select=*&order=created_at.desc'),
  ]);
  return {
    crews:    groups.map(g => Map2.crewFromRow(g, skills)),
    orders:   orders.map(o => Map2.orderFromRow(o, photos)),
    dumps:    dumps.map(Map2.dumpFromRow),
    requests: requests.map(Map2.reqFromRow),
  };
}

/* Reconcilia las habilidades de una cuadrilla: la base guarda una fila por
   habilidad, así que se inserta lo que falta y se borra lo que sobra. */
async function saveSkills(crewId, before, after){
  const add = after.filter(s => !before.includes(s));
  const del = before.filter(s => !after.includes(s));
  if(add.length) await Gamma.insert('group_skills', add.map(s => ({ group_id:crewId, skill:s })));
  for(const s of del) await Gamma.remove('group_skills', `group_id=eq.${crewId}&skill=eq.${s}`);
}
