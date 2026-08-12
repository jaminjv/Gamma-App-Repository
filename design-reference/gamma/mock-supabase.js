/* ============================================================
   Servidor compatible con la API de Supabase, sobre el Postgres real.
   Implementa el subconjunto que usan las aplicaciones: PostgREST (select,
   insert, patch, delete, rpc), auth por contraseña y Storage.

   Existe para probar la capa de datos de verdad contra SQL y contra RLS,
   sin depender de un proyecto de Supabase. No es para producción.
   ============================================================ */
const http = require('http');
const { Pool, types } = require('pg');

/* Fidelidad de tipos con PostgREST. node-pg convierte a objetos de
   JavaScript cosas que PostgREST entrega como texto JSON, y esa diferencia
   haría que la prueba valide algo que no es lo que verá el cliente real. */
types.setTypeParser(1082, (v) => v);          // date -> 'AAAA-MM-DD', no Date
const parseEnumArray = (s) =>
  s === '{}' ? [] : s.slice(1, -1).split(',').map((x) => x.replace(/^"|"$/g, ''));

const RESERVED = new Set(['select', 'order', 'limit', 'offset']);
const uploads = new Map();   // ruta -> {type, body}

function cors(res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', '*');
}
const send = (res, code, obj) => {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(obj === null ? '' : JSON.stringify(obj));
};
function body(req){
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/* Traduce los filtros de PostgREST (col=eq.valor) a SQL parametrizado. */
function where(params, start = 1){
  const parts = [], vals = [];
  let i = start;
  for (const [k, v] of params){
    if (RESERVED.has(k)) continue;
    const [op, ...rest] = String(v).split('.');
    const val = rest.join('.');
    const sqlOp = { eq:'=', neq:'<>', gt:'>', gte:'>=', lt:'<', lte:'<=' }[op];
    if (!sqlOp) continue;
    parts.push(`"${k}" ${sqlOp} $${i++}`);
    vals.push(val);
  }
  return { sql: parts.length ? ' where ' + parts.join(' and ') : '', vals, next: i };
}

async function start(connString, port = 0){
  // Un pool y no un cliente único: las aplicaciones piden varias tablas en
  // paralelo, y sobre una sola conexión esas transacciones se pisan entre sí.
  const pool = new Pool({ connectionString: connString, max: 10 });

  // Los arreglos de enum no tienen OID conocido por node-pg: llegan como
  // '{a,b}'. Se registran sus parsers para que salgan como arreglo JSON.
  {
    const r = await pool.query(`
      select a.oid from pg_type a join pg_type e on a.typelem = e.oid
      where a.typcategory = 'A' and e.typtype = 'e'`);
    for (const row of r.rows) types.setTypeParser(row.oid, parseEnumArray);
  }
  const db = { query: (...a) => pool.query(...a), end: () => pool.end() };

  // Cada petición toma su propia conexión, se degrada al rol sin privilegios
  // y fija el uid de la sesión, para que RLS aplique igual que en Supabase.
  async function asUser(uid, fn){
    const c = await pool.connect();
    try{
      await c.query('begin');
      await c.query("select set_config('test.uid', $1, true)", [uid || '']);
      await c.query("select set_config('test.role', $1, true)", [uid ? 'authenticated' : 'anon']);
      await c.query('set local role app_user');
      const out = await fn(c);
      await c.query('commit');
      return out;
    }catch(e){
      await c.query('rollback').catch(()=>{});
      throw e;
    }finally{
      c.release();
    }
  }

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS'){ cors(res); res.writeHead(204); return res.end(); }

    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    // El token de prueba es el uid a secas; la anon key no identifica a nadie.
    const uid = /^[0-9a-f-]{36}$/i.test(auth) ? auth : null;

    try{
      /* ---------- Auth ---------- */
      if (path === '/auth/v1/token'){
        const { email, password } = JSON.parse((await body(req)).toString() || '{}');
        const r = await db.query('select id, email, full_name from profiles where lower(email)=lower($1)', [email]);
        if (!r.rows.length || password !== 'gamma1954')
          return send(res, 400, { error_description: 'Invalid login credentials' });
        return send(res, 200, {
          access_token: r.rows[0].id, refresh_token: 'r-' + r.rows[0].id,
          token_type: 'bearer', expires_in: 3600, user: r.rows[0],
        });
      }
      if (path === '/auth/v1/logout') return send(res, 204, null);

      /* ---------- Storage ---------- */
      if (path.startsWith('/storage/v1/object/public/')){
        const key = path.replace('/storage/v1/object/public/', '');
        const f = uploads.get(key);
        if (!f){ cors(res); res.writeHead(404); return res.end(); }
        cors(res); res.writeHead(200, { 'Content-Type': f.type }); return res.end(f.body);
      }
      if (path.startsWith('/storage/v1/object/') && req.method === 'POST'){
        const key = path.replace('/storage/v1/object/', '');
        uploads.set(key, { type: req.headers['content-type'] || 'image/jpeg', body: await body(req) });
        return send(res, 200, { Key: key });
      }

      /* ---------- PostgREST ---------- */
      if (path.startsWith('/rest/v1/')){
        const target = path.replace('/rest/v1/', '');
        const params = [...url.searchParams.entries()];

        if (target.startsWith('rpc/')){
          const fn = target.slice(4);
          const args = JSON.parse((await body(req)).toString() || '{}');
          const names = Object.keys(args);
          const sql = `select * from ${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(',')})`;
          const out = await asUser(uid, (c) => c.query(sql, names.map((n) => args[n])));
          return send(res, 200, out.rows);
        }

        if (req.method === 'GET'){
          const w = where(params);
          const order = url.searchParams.get('order');
          const limit = url.searchParams.get('limit');
          let sql = `select * from "${target}"${w.sql}`;
          if (order){
            // PostgREST admite varias columnas separadas por coma.
            const cols = order.split(',').map((part) => {
              const [col, dir] = part.split('.');
              return `"${col}" ${dir === 'desc' ? 'desc' : 'asc'}`;
            });
            sql += ' order by ' + cols.join(', ');
          }
          if (limit) sql += ` limit ${Number(limit)}`;
          const out = await asUser(uid, (c) => c.query(sql, w.vals));
          return send(res, 200, out.rows);
        }

        if (req.method === 'POST'){
          const raw = JSON.parse((await body(req)).toString() || '{}');
          const rows = Array.isArray(raw) ? raw : [raw];
          const cols = [...new Set(rows.flatMap(Object.keys))];
          const out = await asUser(uid, async (c) => {
            const results = [];
            for (const r of rows){
              const q = await c.query(
                `insert into "${target}" (${cols.map((c) => `"${c}"`).join(',')})
                 values (${cols.map((_, i) => `$${i + 1}`).join(',')}) returning *`,
                cols.map((c) => r[c] ?? null));
              results.push(q.rows[0]);
            }
            return results;
          });
          return send(res, 201, out);
        }

        if (req.method === 'PATCH'){
          const patch = JSON.parse((await body(req)).toString() || '{}');
          const cols = Object.keys(patch);
          const sets = cols.map((c, i) => `"${c}" = $${i + 1}`).join(',');
          const w = where(params, cols.length + 1);
          const out = await asUser(uid, (c) => c.query(
            `update "${target}" set ${sets}${w.sql} returning *`,
            [...cols.map((c) => patch[c]), ...w.vals]));
          return send(res, 200, out.rows);
        }

        if (req.method === 'DELETE'){
          const w = where(params);
          await asUser(uid, (c) => c.query(`delete from "${target}"${w.sql}`, w.vals));
          return send(res, 204, null);
        }
      }

      send(res, 404, { message: 'sin ruta: ' + path });
    }catch(e){
      send(res, 400, { message: e.message });
    }
  });

  await new Promise((r) => server.listen(0, r));
  return { port: server.address().port, server, db };
}

module.exports = { start };
