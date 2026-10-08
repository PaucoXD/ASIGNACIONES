// Descarga la Guía de actividades (EPUB) de jw.org y guarda las partes de cada
// semana en data/vym.json para que la app las cargue sola.
// jw.org permite apps gratuitas que descargan sus archivos EPUB.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SALIDA = "data/vym.json";
const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const sinAcento = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Ediciones bimestrales: enero (01), marzo (03), … noviembre (11)
function ediciones() {
  const hoy = new Date(), set = new Set();
  for (let k = -2; k <= 5; k++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + k, 1);
    const m = d.getMonth() + 1, mi = m % 2 ? m : m - 1;
    set.add(`${d.getFullYear()}${String(mi).padStart(2, "0")}`);
  }
  return [...set].sort();
}

function aTexto(h) {
  return h.replace(/<(script|style|textarea)[\s\S]*?<\/\1>/g, "")
    .replace(/<\/(p|h\d|div|li|header|section)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n));
}

// Misma lógica que leerPrograma() en index.html
function leerPrograma(texto) {
  const lineas = texto.split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const r = { canciones: [], partes: [], lectura: "" };
  let sec = "", ultima = null;
  lineas.forEach(l => {
    const U = sinAcento(l);
    if (/^TESOROS DE LA BIBLIA/.test(U)) { sec = "t"; return; }
    if (/^SEAMOS MEJORES MAESTROS/.test(U)) { sec = "s"; return; }
    if (/^NUESTRA VIDA CRISTIANA/.test(U)) { sec = "n"; return; }
    for (const m of l.matchAll(/Canci[oó]n\s+(\d{1,3})/gi)) r.canciones.push({ n: m[1], sec });
    if (!r.lectura && !sec && /^[A-ZÁÉÍÓÚÑ0-9 ]+\s\d+([,\-–]\s?\d+)*$/.test(l) && !MESES.some(x => U.includes(" DE " + x))) r.lectura = l;
    const m = l.match(/^(\d{1,2})\.\s*(.+)$/);
    if (m && sec) {
      let titulo = m[2], min = 0;
      const mm = titulo.match(/\((\d+)\s*mins?\.?\)/i);
      if (mm) { min = +mm[1]; titulo = titulo.slice(0, mm.index); }
      titulo = titulo.replace(/\s*[|·].*$/, "").trim();
      ultima = { sec, titulo, min };
      r.partes.push(ultima);
      return;
    }
    if (ultima && !ultima.min) {
      const mm = l.match(/^\(?(\d+)\s*mins?\.?\)?/i);
      if (mm) ultima.min = +mm[1];
    }
  });
  return r;
}

// "7-13 DE SEPTIEMBRE" o "28 DE SEPTIEMBRE–4 DE OCTUBRE" → lunes de esa semana
function lunes(encabezado, edicion) {
  const U = sinAcento(encabezado);
  const m = U.match(/(\d{1,2})(?:\s+DE\s+([A-Z]+))?\s*[-–]\s*(\d{1,2})\s+DE\s+([A-Z]+)/);
  if (!m) return null;
  const mes = MESES.indexOf(m[2] || m[4]);
  if (mes < 0) return null;
  let anio = +edicion.slice(0, 4);
  if (mes === 11 && edicion.endsWith("01")) anio--;
  const d = new Date(anio, mes, +m[1]);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}

const datos = existsSync(SALIDA) ? JSON.parse(readFileSync(SALIDA, "utf8")) : {};
let cambios = 0;
for (const ed of ediciones()) {
  const api = `https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?output=json&pub=mwb&fileformat=EPUB&alllangs=0&langwritten=S&txtCMSLang=S&issue=${ed}`;
  let url;
  try {
    const res = await fetch(api);
    if (!res.ok) { console.log(ed, "aún no publicada"); continue; }
    url = (await res.json()).files?.S?.EPUB?.[0]?.file?.url;
  } catch (e) { console.log(ed, "error:", e.message); continue; }
  if (!url) { console.log(ed, "sin EPUB"); continue; }
  const dir = `tmp-${ed}`;
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir);
  writeFileSync(join(dir, "g.epub"), Buffer.from(await (await fetch(url)).arrayBuffer()));
  execSync(`cd ${dir} && unzip -o -q g.epub`);
  const oebps = join(dir, "OEBPS");
  for (const f of readdirSync(oebps).filter(f => /^\d+\.xhtml$/.test(f)).sort()) {
    const h = readFileSync(join(oebps, f), "utf8");
    if (!/TESOROS DE LA BIBLIA/.test(h)) continue;
    const h1 = aTexto((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "").replace(/\s+/g, " ").trim();
    const clave = lunes(h1, ed);
    const prog = leerPrograma(aTexto(h.replace(/^[\s\S]*?<body[^>]*>/, "")));
    if (!clave || !prog.partes.length) { console.log(ed, f, "no se pudo leer:", h1); continue; }
    prog.semana = h1;
    if (JSON.stringify(datos[clave]) !== JSON.stringify(prog)) cambios++;
    datos[clave] = prog;
    console.log(ed, clave, prog.semana, "·", prog.lectura, "· canciones", prog.canciones.map(c => c.n).join("/"), "·", prog.partes.map(p => `${p.sec}:${p.titulo} (${p.min})`).join(" | "));
  }
  rmSync(dir, { recursive: true, force: true });
}
// Conserva solo desde hace 8 semanas
const limite = iso(new Date(Date.now() - 56 * 86400000));
for (const k of Object.keys(datos)) if (k < limite) delete datos[k];
const ordenado = Object.fromEntries(Object.keys(datos).sort().map(k => [k, datos[k]]));
mkdirSync("data", { recursive: true });
writeFileSync(SALIDA, JSON.stringify(ordenado, null, 1) + "\n");
console.log(`Semanas guardadas: ${Object.keys(ordenado).length} (cambios: ${cambios})`);
