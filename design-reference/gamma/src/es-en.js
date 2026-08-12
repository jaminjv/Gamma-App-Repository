/* ============================================================
   Traducción ES -> EN de lo que escriben los líderes.
   Sin servicio externo: el CSP de la página bloquea cualquier host, así
   que la traducción es local. Funciona en dos pasos:
     1. Frases completas conocidas — traducción real, redactada a mano.
     2. Si no hay coincidencia, sustitución término a término con un
        glosario del oficio, que da un texto entendible aunque no pulido.
   Para producción esto se reemplaza por una llamada a un traductor real
   desde el backend; el resto de la interfaz no cambia.
   ============================================================ */
const ES_EN_PHRASES = {
  'la línea de escalada está deshilachada cerca del empalme, necesito un repuesto de 45 metros antes del jueves.':
    'The climbing line is frayed near the splice — I need a 150 ft replacement before Thursday.',
  'los dientes del triturador de tocones están gastados, corta muy lento. necesita un juego nuevo.':
    'The stump grinder teeth are worn down and it is cutting very slowly. It needs a new set.',
  'dos cascos nuevos y un par de zahones de motosierra, talla l.':
    'Two new hard hats and a pair of chainsaw chaps, size L.',
  'se está acabando el aceite de barra, quedan como dos garrafas.':
    'Running low on bar oil — about two jugs left.',
  'el tocón está muy cerca de la línea de gas, se necesita otra cuadrilla con permiso de servicios.':
    'The stump is too close to the gas line; another crew with utility clearance is needed.',
  'carga parcial, maleza y ramas.': 'Partial load, brush and branches.',
  'carga completa, casi todo secciones de tronco.': 'Full load, mostly trunk sections.',
  'dos cargas seguidas.': 'Two loads back to back.',
  'la motosierra pequeña no arranca, necesita bujía nueva.':
    'The small chainsaw will not start — it needs a new spark plug.',
};

/* Glosario del oficio. El orden importa: las expresiones de varias
   palabras van primero para que no las parta la sustitución simple. */
const ES_EN_GLOSSARY = [
  ['línea de escalada','climbing line'], ['cuerda de escalada','climbing rope'],
  ['triturador de tocones','stump grinder'], ['aceite de barra','bar oil'],
  ['zahones de motosierra','chainsaw chaps'], ['equipo de seguridad','safety gear'],
  ['línea de gas','gas line'], ['línea eléctrica','power line'],
  ['cable eléctrico','power line'], ['permiso de servicios','utility clearance'],
  ['daño por tormenta','storm damage'], ['poda en altura','aerial pruning'],
  ['camión canasta','bucket truck'], ['sitio de vaciado','dump site'],
  ['carga completa','full load'], ['carga parcial','partial load'],
  ['casco','hard hat'], ['cascos','hard hats'], ['bujía','spark plug'],
  ['motosierra','chainsaw'], ['tocón','stump'], ['tocones','stumps'],
  ['rama','branch'], ['ramas','branches'], ['tronco','trunk'], ['troncos','logs'],
  ['astillas','wood chips'], ['maleza','brush'], ['árbol','tree'], ['árboles','trees'],
  ['cuerda','rope'], ['sogas','ropes'], ['soga','rope'], ['grúa','crane'],
  ['combustible','fuel'], ['repuesto','replacement'], ['repuestos','parts'],
  ['herramienta','tool'], ['herramientas','tools'], ['escalera','ladder'],
  ['guantes','gloves'], ['lentes','safety glasses'], ['arnés','harness'],
  ['cuadrilla','crew'], ['oficina','office'], ['cliente','client'],
  ['patio trasero','backyard'], ['entrada','driveway'], ['techo','roof'],
  ['cerca','fence'], ['garaje','garage'], ['acera','sidewalk'],
  ['deshilachada','frayed'], ['deshilachado','frayed'], ['gastado','worn'],
  ['gastados','worn'], ['roto','broken'], ['rota','broken'], ['dañado','damaged'],
  ['dañada','damaged'], ['nuevo','new'], ['nueva','new'], ['nuevos','new'],
  ['nuevas','new'], ['peligroso','dangerous'], ['urgente','urgent'],
  ['necesito','I need'], ['necesita','it needs'], ['necesitamos','we need'],
  ['no arranca','will not start'], ['no sirve','is not working'],
  ['se acabó','ran out of'], ['se está acabando','running low on'],
  ['quedan','left'], ['falta','missing'], ['faltan','missing'],
  ['muy cerca','too close'], ['cerca de','near'], ['antes del','before'],
  ['antes de','before'], ['seguidas','back to back'], ['completa','full'],
  ['parcial','partial'], ['talla','size'], ['juego','set'], ['par','pair'],
  ['dos','two'], ['tres','three'], ['cuatro','four'], ['garrafas','jugs'],
  ['lunes','Monday'], ['martes','Tuesday'], ['miércoles','Wednesday'],
  ['jueves','Thursday'], ['viernes','Friday'], ['sábado','Saturday'],
  ['y','and'], ['o','or'], ['con','with'], ['sin','without'], ['para','for'],
  ['pero','but'], ['muy','very'], ['más','more'], ['está','is'], ['están','are'],
  ['el','the'], ['la','the'], ['los','the'], ['las','the'], ['un','a'], ['una','a'],
  ['de','of'], ['del','of the'], ['en','in'], ['por','for'], ['que','that'],
  ['como','about'], ['casi','almost'], ['todo','all'], ['otra','another'],
];

function toEnglish(es){
  const key = String(es || '').trim().toLowerCase();
  if (!key) return '';
  if (ES_EN_PHRASES[key]) return ES_EN_PHRASES[key];

  // Sustitución término a término, respetando los límites de palabra.
  let out = ' ' + key + ' ';
  for (const [a, b] of ES_EN_GLOSSARY){
    out = out.replace(new RegExp(`(?<=[^\\p{L}])${a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=[^\\p{L}])`, 'giu'), b);
  }
  out = out.trim().replace(/\s+/g, ' ');
  return out.charAt(0).toUpperCase() + out.slice(1);
}
