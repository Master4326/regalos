/* ============================================================================
   servidor.js  —  para ver el calendario desde otro dispositivo

   Uso:   node servidor.js          (o doble clic en SERVIR.bat)
          node servidor.js 3000     para usar otro puerto

   Por qué no vale `py -m http.server`: ese no entiende las peticiones por
   RANGO, y el audio es justo lo que las necesita. Sin rangos el navegador
   tiene que descargarse la canción ENTERA antes de que suene —cinco megas de
   espera por día— y además la barra no deja adelantar, porque adelantar es
   pedir "dame desde el segundo 90". Con rangos, la canción empieza al
   instante y se puede saltar a cualquier punto.
   ============================================================================ */
const http = require("http");
const fs = require("fs");
const path = require("path");

const RAIZ = __dirname;
const PUERTO = parseInt(process.argv[2], 10) || 8080;

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt":  "text/plain; charset=utf-8",
  ".mp3":  "audio/mpeg",   ".m4a": "audio/mp4",   ".ogg": "audio/ogg",
  ".opus": "audio/ogg",    ".wav": "audio/wav",   ".flac": "audio/flac",
  ".jpg":  "image/jpeg",   ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp",   ".gif": "image/gif",   ".svg": "image/svg+xml",
  ".lrc":  "text/plain; charset=utf-8"
};

/* ── quién ha abierto el calendario ─────────────────────────────────────────
   Compartido por un túnel (la pestaña PORTS de VS Code), TODAS las peticiones
   llegan desde 127.0.0.1: quien las pide es el túnel, no la persona, así que la
   IP de verdad no se ve y no hay forma de saber QUIÉN entró. Lo que sí se sabe
   es que entró, y eso es lo que contesta la pregunta.

   No se apunta cada archivo —una sola visita pide la letra, la carátula y
   docenas de trozos del mp3—, solo las dos cosas que significan algo: que
   alguien ABRIÓ el calendario y que alguien PUSO una canción. */
let visitas = 0;
const visto = new Map();

function repetida(clave, segundos){
  const ahora = Date.now();
  const antes = visto.get(clave) || 0;
  visto.set(clave, ahora);
  return ahora - antes < segundos * 1000;
}

function aparato(ua){
  if (/Android|iPhone|iPad|Mobile/i.test(ua || "")) return "un móvil";
  if (/Macintosh|Mac OS/i.test(ua || ""))           return "un Mac";
  if (/Windows/i.test(ua || ""))                    return "un Windows";
  return "algo";
}

/* De dónde viene la petición. Por el túnel TODAS llegan desde 127.0.0.1, así
   que la IP no distingue nada; lo que sí distingue es a qué NOMBRE llamaron:
   quien entra por el enlace compartido pide el túnel, no "localhost". Es la
   diferencia entre "lo ha abierto alguien" y "lo has abierto tú". */
function origen(req){
  const h = req.headers;
  const anfitrion = String(h["x-forwarded-host"] || h.host || "").toLowerCase();
  if (h["x-forwarded-for"] || h["x-tunnel-authorization"] ||
      /devtunnels\.ms|githubpreview|ngrok|trycloudflare|loca\.lt/.test(anfitrion))
    return "por el enlace compartido";
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(anfitrion))
    return "desde este ordenador";
  return "desde la red de casa";
}

/* Lo apuntado va a la consola Y a VISITAS.txt, al lado del calendario. El
   archivo no es un lujo: la consola se pierde en cuanto se cierra la ventana o
   alguien para el servidor, y entonces no queda ni rastro de quién entró. Con
   el archivo se puede mirar después, y aguanta de un arranque al siguiente.
   Se escribe sin esperar (appendFile a secas): apuntar una visita nunca puede
   retrasar la canción que se está sirviendo. */
const DIARIO = path.join(RAIZ, "VISITAS.txt");

function apunta(texto){
  const hora = new Date().toTimeString().slice(0, 8);
  console.log("  " + hora + "   " + texto);
  const dia = new Date().toLocaleDateString("es-ES",
    { day: "2-digit", month: "2-digit", year: "numeric" });
  fs.appendFile(DIARIO, dia + " " + hora + "   " + texto + "\r\n", () => {});
}

function anotarVisita(destino, tipo, req){
  if (destino.endsWith("index.html")){
    /* Los 20 s son por las recargas: F5 dos veces seguidas es la misma visita.
       La cuenta va POR APARATO: si la clave fuera solo "visita", dos personas
       distintas abriéndolo a la vez —que es justo lo que pasa cuando mandas el
       enlace— se contarían como una. */
    const ua = req.headers["user-agent"] || "";
    if (repetida("visita:" + ua, 20)) return;
    apunta("visita " + (++visitas) + " — " + origen(req) + " · " + aparato(ua));
    return;
  }
  if (!/^audio\//.test(tipo)) return;
  /* El navegador pide el mp3 a trozos, así que una canción son muchas
     peticiones: se apunta una vez y se calla minuto y medio. */
  const cancion = path.basename(destino).replace(/\.[^.]+$/, "")
                      .replace(/^\d{4}-\d{2}-\d{2}\s*-\s*/, "");
  if (!repetida("suena:" + cancion, 90))
    apunta("           están oyendo " + cancion + "  (" + origen(req) + ")");
}

http.createServer((req, res) => {
  let ruta;
  try { ruta = decodeURIComponent(req.url.split("?")[0]); }
  catch (e){ res.writeHead(400); return res.end("URL mal formada"); }
  if (ruta === "/" || ruta.endsWith("/")) ruta += "index.html";

  /* Nadie se sale de la carpeta del regalo, pida lo que pida. */
  const destino = path.join(RAIZ, path.normalize(ruta).replace(/^([\\/])+/, ""));
  if (!destino.startsWith(RAIZ)){ res.writeHead(403); return res.end("Fuera"); }
  /* El registro de visitas vive dentro de la carpeta, así que hay que negarlo a
     mano: si no, cualquiera con el enlace podría pedir /VISITAS.txt y leer
     quién ha entrado. Es tuyo, no del que abre el calendario. */
  if (path.basename(destino).toLowerCase() === "visitas.txt"){
    res.writeHead(404); return res.end("No está: " + ruta);
  }

  fs.stat(destino, (err, st) => {
    if (err || !st.isFile()){ res.writeHead(404); return res.end("No está: " + ruta); }

    const tipo = TIPOS[path.extname(destino).toLowerCase()] || "application/octet-stream";
    anotarVisita(destino, tipo, req);
    const cab = {
      "Content-Type": tipo,
      "Accept-Ranges": "bytes",
      /* El audio y las carátulas no cambian: que el navegador no los vuelva a
         pedir cada vez que se abre un día. */
      "Cache-Control": /^(audio|image)\//.test(tipo) ? "public, max-age=604800" : "no-cache"
    };

    const rango = req.headers.range;
    if (rango){
      const m = /bytes=(\d*)-(\d*)/.exec(rango);
      let ini = m && m[1] ? parseInt(m[1], 10) : 0;
      let fin = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (isNaN(ini) || isNaN(fin) || ini > fin || fin >= st.size){
        res.writeHead(416, { "Content-Range": "bytes */" + st.size });
        return res.end();
      }
      cab["Content-Range"] = "bytes " + ini + "-" + fin + "/" + st.size;
      cab["Content-Length"] = fin - ini + 1;
      res.writeHead(206, cab);
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(destino, { start: ini, end: fin }).pipe(res);
    }

    cab["Content-Length"] = st.size;
    res.writeHead(200, cab);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(destino).pipe(res);
  });
}).listen(PUERTO, "0.0.0.0", () => {
  console.log("");
  console.log("  El calendario está servido en:");
  console.log("     http://localhost:" + PUERTO);
  console.log("");
  console.log("  Para compartirlo: pestaña PORTS de VS Code → Forward a Port → "
              + PUERTO + " → clic derecho → Port Visibility → Public");
  console.log("");
  console.log("  Aquí debajo van saliendo las visitas. Si no sale nada, es que");
  console.log("  nadie lo ha abierto todavía.");
  console.log("");
  console.log("  Ctrl+C para pararlo.");
  console.log("  ────────────────────────────────────────────────────────────");
});
