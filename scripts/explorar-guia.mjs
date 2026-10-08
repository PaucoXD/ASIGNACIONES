// Prueba: descarga la Guía de actividades (EPUB) y muestra su estructura en el log.
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const issue = process.argv[2] || "202609";
const api = `https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?output=json&pub=mwb&fileformat=EPUB&alllangs=0&langwritten=S&txtCMSLang=S&issue=${issue}`;
const info = await (await fetch(api)).json();
const file = info.files?.S?.EPUB?.[0]?.file;
console.log("EPUB:", file?.url, file?.modifiedDatetime);
const buf = Buffer.from(await (await fetch(file.url)).arrayBuffer());
mkdirSync("tmp-epub", { recursive: true });
require_write: {
  const fs = await import("node:fs");
  fs.writeFileSync("tmp-epub/guia.epub", buf);
}
execSync("cd tmp-epub && unzip -o -q guia.epub");
const lista = execSync("cd tmp-epub && find . -type f | sort").toString();
console.log(lista);
const texto = h => h.replace(/<(script|style)[\s\S]*?<\/\1>/g, "").replace(/<\/(p|h\d|div|li|header|section)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n)).replace(/\n\s*\n+/g, "\n");
const dir = execSync("cd tmp-epub && find . -name '*.xhtml' | sort").toString().trim().split("\n");
for (const f of dir.slice(0, 8)) {
  const h = readFileSync(join("tmp-epub", f), "utf8");
  console.log("\n=========", f, h.length);
  console.log(texto(h).slice(0, 2500));
}
// HTML crudo de un capítulo con programa
const conPrograma = dir.find(f => /TESOROS DE LA BIBLIA/i.test(readFileSync(join("tmp-epub", f), "utf8")));
console.log("\n========= HTML crudo:", conPrograma);
console.log(readFileSync(join("tmp-epub", conPrograma), "utf8").slice(0, 9000));
