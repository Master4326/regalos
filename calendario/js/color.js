/* ============================================================================
   color.js  —  la paleta viva
   ----------------------------------------------------------------------------
   El calendario no tiene UN color. Lo saca de algo:

     · la vista de año  →  el latón de la casa, quieto
     · un mes           →  un recorrido de tono a lo largo de los 12 meses
     · una canción      →  la CARÁTULA del disco, si se pueden leer sus píxeles;
                           y si no, del título + el artista (siempre igual para
                           la misma canción)

   Todo se trabaja en OKLab, nunca en HSL. En HSL la saturación cuenta de más y
   las portadas oscuras acaban en magenta; en OKLab la distancia entre dos
   colores se parece a la que ve el ojo y el tono no se tuerce al subir el
   brillo.

   Nota importante sobre el doble clic:
   abriendo index.html desde el disco (file://) el navegador NO deja leer los
   píxeles de una imagen local — la carátula se ve, pero el lienzo queda
   "manchado" y getImageData lanza. Por eso hay siempre un plan B derivado del
   texto, que no falla nunca. Si algún día esto se publica en una web, la
   extracción real empieza a funcionar sola.
   ============================================================================ */
(function(){
  "use strict";

  /* ── constantes de extracción (heredadas del reproductor) ───────────────── */
  var LADO_MUESTRA = 176;   // 96 era poco: un rasgo FINO (un anillo, un rótulo)
                            // se promedia con el fondo y pierde su croma
  var AREA_MIN      = 0.025; // 2,5 % de superficie para optar a acento
  var AREA_MIN_APAG = 0.012; // puerta de 2º nivel: si nada grande tiene color
  var FUSION_DIST   = 0.055; // CORTO a propósito: con un umbral largo las
                             // fusiones se encadenan y la imagen entera colapsa
                             // en una sola familia gris
  var CROMA_SUELO   = 0.030; // por debajo de esto la imagen es gris, no color
  var CONTRASTE_MIN = 4.5;   // WCAG AA

  /* ── sRGB ↔ OKLab ───────────────────────────────────────────────────────── */
  function aLineal(c){
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function aGamma(c){
    c = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  }
  function rgbAOklab(r, g, b){
    var R = aLineal(r), G = aLineal(g), B = aLineal(b);
    var l = Math.cbrt(0.4122214708*R + 0.5363325363*G + 0.0514459929*B);
    var m = Math.cbrt(0.2119034982*R + 0.6806995451*G + 0.1073969566*B);
    var s = Math.cbrt(0.0883024619*R + 0.2817188376*G + 0.6299787005*B);
    return {
      L: 0.2104542553*l + 0.7936177850*m - 0.0040720468*s,
      a: 1.9779984951*l - 2.4285922050*m + 0.4505937099*s,
      b: 0.0259040371*l + 0.7827717662*m - 0.8086757660*s
    };
  }
  function oklabARgb(L, a, b){
    var l_ = L + 0.3963377774*a + 0.2158037573*b;
    var m_ = L - 0.1055613458*a - 0.0638541728*b;
    var s_ = L - 0.0894841775*a - 1.2914855480*b;
    var l = l_*l_*l_, m = m_*m_*m_, s = s_*s_*s_;
    return [
      aGamma( 4.0767416621*l - 3.3077115913*m + 0.2309699292*s),
      aGamma(-1.2684380046*l + 2.6097574011*m - 0.3413193965*s),
      aGamma(-0.0041960863*l - 0.7034186147*m + 1.7076147010*s)
    ];
  }
  /* OKLCH es OKLab en polares: más cómodo para "mismo tono, otro brillo". */
  function lch(o){ return { L:o.L, C:Math.hypot(o.a,o.b), h:Math.atan2(o.b,o.a) }; }

  /* ¿Cabe este color en la pantalla? Sin este paso, un tono muy cargado se sale
     de sRGB y el recorte canal a canal TUERCE el tono: un cian bonito acaba en
     un #00ccff eléctrico de rótulo de neón. Bajar el croma hasta que quepa
     conserva el tono y el brillo, que es lo que el ojo reconoce. */
  function cabe(L, C, h){
    var l_ = L + 0.3963377774*(Math.cos(h)*C) + 0.2158037573*(Math.sin(h)*C);
    var m_ = L - 0.1055613458*(Math.cos(h)*C) - 0.0638541728*(Math.sin(h)*C);
    var s_ = L - 0.0894841775*(Math.cos(h)*C) - 1.2914855480*(Math.sin(h)*C);
    var l = l_*l_*l_, m = m_*m_*m_, s = s_*s_*s_;
    var v = [ 4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
             -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
             -0.0041960863*l - 0.7034186147*m + 1.7076147010*s ];
    for (var i = 0; i < 3; i++) if (v[i] < -0.0005 || v[i] > 1.0005) return false;
    return true;
  }
  function deLch(L, C, h){
    if (!cabe(L, C, h)){
      var lo = 0, hi = C;
      for (var i = 0; i < 22; i++){            // 22 pasos = precisión de sobra
        var mid = (lo + hi) / 2;
        if (cabe(L, mid, h)) lo = mid; else hi = mid;
      }
      C = lo;
    }
    return oklabARgb(L, Math.cos(h)*C, Math.sin(h)*C);
  }
  function hex(rgb){
    return "#" + rgb.map(function(v){ return ("0"+v.toString(16)).slice(-2); }).join("");
  }
  function hexDeLch(L, C, h){ return hex(deLch(L, C, h)); }

  /* ── contraste WCAG ─────────────────────────────────────────────────────── */
  function luz(rgb){
    return 0.2126*aLineal(rgb[0]) + 0.7152*aLineal(rgb[1]) + 0.0722*aLineal(rgb[2]);
  }
  function contraste(a, b){
    var x = luz(a), y = luz(b);
    return (Math.max(x,y) + 0.05) / (Math.min(x,y) + 0.05);
  }
  /* La red de seguridad: sube SOLO la L hasta cumplir 4,5:1 contra la
     superficie más clara sobre la que va a caer. El TONO no se toca nunca —
     eso es lo que evita que un acento amarillo acabe convertido en otro color
     para poder leerse. Sin esto, la paleta viva es un riesgo: un día amanece un
     día en amarillo sobre crema y no hay quien lo lea. */
  function garantizar(L, C, h, fondo){
    var paso = 0.02, tope = 0.985;
    for (var i = 0; i < 60; i++){
      if (contraste(deLch(L, C, h), fondo) >= CONTRASTE_MIN) break;
      if (L >= tope) break;
      L = Math.min(tope, L + paso);
    }
    /* Si ni en casi blanco llega (fondo claro), baja en vez de subir. */
    if (contraste(deLch(L, C, h), fondo) < CONTRASTE_MIN){
      var Lb = L;
      for (var j = 0; j < 60 && Lb > 0.05; j++){
        Lb -= paso;
        if (contraste(deLch(Lb, C, h), fondo) >= CONTRASTE_MIN){ L = Lb; break; }
      }
    }
    return L;
  }

  /* ── azar determinista ──────────────────────────────────────────────────── */
  function picadillo(s){
    var h = 5381;
    s = String(s == null ? "" : s);
    for (var k = 0; k < s.length; k++) h = (Math.imul(h, 33) ^ s.charCodeAt(k)) | 0;
    return h | 0;
  }
  function revuelto(n){
    var h = n | 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return (h ^ (h >>> 16)) >>> 0;
  }

  /* ── la tinta: el ancla del regalo ──────────────────────────────────────── */
  /* El fondo NO se va del todo con el acento. La identidad de esto es una funda
     de disco de noche, azul-violeta, y si el fondo persiguiera al acento el
     calendario cambiaría de personalidad doce veces al año. Lo que hace es
     ARRIMARSE un poco al color del momento, con un tope de 20°: en enero la
     noche tira a ciruela y en diciembre a azul, pero sigue siendo la misma
     noche. El color de verdad lo llevan el acento y las manchas del aura. */
  var TINTA = lch(rgbAOklab(0x0e, 0x0f, 0x22));        // el #0e0f22 de siempre
  var ARRIMO_FONDO = 0.16;                             // cuánto se acerca a él

  /* Camino corto entre dos tonos: sin esto, ir de 350° a 10° da la vuelta
     entera al círculo y el fondo pasa por todos los colores por el camino. */
  function mezclaTono(a, b, t){
    var TAU = Math.PI * 2;
    var d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
    var TOPE = 0.35;                                   // ~20°: nunca cambia de familia
    d = Math.max(-Math.PI, Math.min(Math.PI, d));
    d = Math.max(-TOPE / Math.max(t, 1e-6), Math.min(TOPE / Math.max(t, 1e-6), d));
    return a + d * t;
  }

  /* ── construir una paleta entera a partir de un acento ──────────────────── */
  /* Recibe el color protagonista en OKLCH y devuelve TODAS las variables.
     Nada de aquí es un hex fijo: bordes, paneles, texto y fondo salen de la
     misma familia. Un color de marca incrustado en un solo sitio ensucia todos
     los demás. */
  function construir(L, C, h, nombre){
    C = Math.max(0.045, Math.min(0.19, C));   // ni gris del todo ni fosforito

    /* El fondo: dos paradas muy oscuras, en el tono de la tinta arrimado al del
       momento y con poquísimo croma. Cambia de CARÁCTER, no de brillo — nada de
       aquí parpadea ni late. */
    var hFondo = mezclaTono(TINTA.h, h, ARRIMO_FONDO);
    var din1 = deLch(0.205, Math.min(0.050, TINTA.C + C * 0.20), hFondo);
    var din2 = deLch(0.105, Math.min(0.036, TINTA.C + C * 0.12), hFondo);

    /* El acento se mide contra la parada MÁS CLARA del degradado (din1), que es
       donde de verdad cae el texto, no contra el panel. */
    var Lacc = garantizar(Math.max(L, 0.62), C, h, din1);

    var panel  = deLch(0.205, Math.min(0.044, TINTA.C + C * 0.18), hFondo);
    var panel2 = deLch(0.155, Math.min(0.034, TINTA.C + C * 0.12), hFondo);
    var marco  = deLch(0.300, Math.min(0.050, TINTA.C + C * 0.20), hFondo);

    /* El texto también sale de la paleta: un blanco con un pelo del tono del
       momento. Si fuera fijo, sobre una portada en blanco y negro el nombre del
       disco cantaría en otro color. */
    var texto = deLch(0.955, 0.014, h);
    var tenue = deLch(0.760, 0.020, h);
    var mudo  = deLch(0.560, 0.022, h);

    /* La segunda voz — la que lleva la nota, lo más personal del regalo.
       Va 60° por debajo del acento, no enfrente: latón y rosa son vecinos, y ese
       vecindario es justo lo que hacía bonita la pareja original. Más apagada
       que el acento a propósito: es la segunda voz, no un segundo protagonista. */
    var hSeg = h - 1.05;                      // ~60° en radianes
    var Cseg = C * 0.72;
    var seg  = deLch(garantizar(0.70, Cseg, hSeg, din1), Cseg, hSeg);

    return {
      nombre:      nombre || "",
      acento:      hex(deLch(Lacc, C, h)),
      acentoLuz:   hex(deLch(Math.min(0.965, Lacc + 0.13), C * 0.80, h)),
      acentoTenue: hex(deLch(Math.max(0.30, Lacc - 0.24), C * 0.72, h)),
      din1:        hex(din1),
      din2:        hex(din2),
      panel:       hex(panel),
      panel2:      hex(panel2),
      marco:       hex(marco),
      texto:       hex(texto),
      textoTenue:  hex(tenue),
      textoMudo:   hex(mudo),
      segunda:     hex(seg),
      L: Lacc, C: C, h: h
    };
  }

  /* ── plan B: paleta derivada de un texto ────────────────────────────────── */
  /* Misma canción → mismo color, siempre. Ni aleatorio (se siente caótico) ni
     cíclico (se nota a los tres días). */
  function deTexto(txt, nombre){
    var s = revuelto(picadillo(txt));
    var h = (s % 3600) / 3600 * Math.PI * 2;           // tono completo
    var C = 0.085 + ((s >>> 12) % 70) / 1000;          // 0.085 – 0.155
    var L = 0.66  + ((s >>> 20) % 140) / 1000;         // 0.66  – 0.80
    return construir(L, C, h, nombre || "texto");
  }

  /* ── la paleta de la casa y la de cada mes ──────────────────────────────── */
  /* El latón de la portada, tal cual estaba: es la identidad del regalo. */
  var TONO_CASA = lch(rgbAOklab(0xd9, 0xa4, 0x41));    // el #d9a441 de siempre
  var CASA = construir(TONO_CASA.L, TONO_CASA.C, TONO_CASA.h, "casa");

  /* Los doce meses recorren la rueda de tono partiendo del latón: enero entra
     frío y el verano llega cálido. Es un giro LENTO y ordenado, no doce colores
     sueltos: se nota al pasar de mes y no se pelea con la portada. */
  function deMes(m){
    var giro   = (m / 12) * Math.PI * 2 * 0.62;        // ~223° repartidos
    var vaiven = Math.cos((m / 12) * Math.PI * 2);     // invierno, menos croma
    return construir(0.72, 0.105 + vaiven * 0.022, TONO_CASA.h - giro, "mes-" + m);
  }

  /* ── extracción real desde la carátula ──────────────────────────────────── */
  function extraer(img){
    var lado = LADO_MUESTRA;
    var lienzo = document.createElement("canvas");
    lienzo.width = lienzo.height = lado;
    var ctx = lienzo.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, lado, lado);

    var px;
    try { px = ctx.getImageData(0, 0, lado, lado).data; }
    catch (e) { return null; }   // file:// → lienzo manchado. Plan B.

    /* Cubos gruesos en OKLab: agrupan lo que el ojo agruparía. */
    var cubos = Object.create(null), total = 0;
    for (var i = 0; i < px.length; i += 4){
      if (px[i+3] < 128) continue;
      var o = rgbAOklab(px[i], px[i+1], px[i+2]);
      if (o.L < 0.10 || o.L > 0.95) continue;          // negros y blancos fuera
      var k = Math.round(o.L*14) + "|" + Math.round(o.a*60) + "|" + Math.round(o.b*60);
      var c = cubos[k] || (cubos[k] = { n:0, L:0, a:0, b:0 });
      c.n++; c.L += o.L; c.a += o.a; c.b += o.b;
      total++;
    }
    if (!total) return null;

    var lista = [];
    for (var k2 in cubos){
      var c2 = cubos[k2];
      lista.push({ n:c2.n, L:c2.L/c2.n, a:c2.a/c2.n, b:c2.b/c2.n });
    }

    /* Fusión con umbral CORTO y los tres ejes pesando igual. Con un umbral
       largo, en una imagen apagada todo queda a menos de esa distancia de todo,
       las fusiones se encadenan (A con B, B con C…) y la imagen entera colapsa
       en UNA familia gris. */
    lista.sort(function(x, y){ return y.n - x.n; });
    var fam = [];
    for (var i2 = 0; i2 < lista.length; i2++){
      var v = lista[i2], puesto = false;
      for (var f = 0; f < fam.length; f++){
        var g = fam[f];
        if (Math.hypot(v.L - g.L, v.a - g.a, v.b - g.b) < FUSION_DIST){
          var np = g.n + v.n;
          g.L = (g.L*g.n + v.L*v.n)/np;
          g.a = (g.a*g.n + v.a*v.n)/np;
          g.b = (g.b*g.n + v.b*v.n)/np;
          g.n = np; puesto = true; break;
        }
      }
      if (!puesto) fam.push({ n:v.n, L:v.L, a:v.a, b:v.b });
    }

    /* MANDA EL ÁREA. El croma solo desempata entre los que YA entraron; si no,
       cuatro píxeles iridiscentes le ganan al dorado que de verdad manda.
       Puerta de dos niveles: si nada grande tiene color, baja el listón y deja
       hablar a lo pequeño (el anillo dorado que ocupa el 2 %). */
    function candidatos(minArea){
      return fam.filter(function(g){
        return g.n / total >= minArea && Math.hypot(g.a, g.b) >= CROMA_SUELO;
      });
    }
    var cand = candidatos(AREA_MIN);
    if (!cand.length) cand = candidatos(AREA_MIN_APAG);
    if (!cand.length) return null;                     // imagen gris de verdad

    cand.sort(function(x, y){
      var ax = x.n/total, ay = y.n/total;
      if (Math.abs(ax - ay) > 0.02) return ay - ax;              // primero el área
      return Math.hypot(y.a, y.b) - Math.hypot(x.a, x.b);        // croma desempata
    });

    var w = cand[0];
    return construir(w.L, Math.hypot(w.a, w.b), Math.atan2(w.b, w.a), "caratula");
  }

  /* Carga la carátula y, si puede leerla, devuelve su paleta. Si no puede
     (file://, imagen que no carga, imagen gris del todo), devuelve la del texto.
     Un contador de secuencia hace que solo la ÚLTIMA petición pueda tocar la
     pantalla: abrir dos días seguidos deprisa no deja la paleta del anterior. */
  var seq = 0;
  function deCancion(url, txt, cb){
    var yo = ++seq;
    var plan = deTexto(txt, "texto");
    if (!url){ cb(plan, yo === seq); return; }
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = function(){
      var p = null;
      try { p = extraer(img); } catch(e){ p = null; }
      cb(p || plan, yo === seq);
    };
    img.onerror = function(){ cb(plan, yo === seq); };
    img.src = url;
  }

  /* ── aplicar ────────────────────────────────────────────────────────────── */
  var actual = CASA;
  function aplicar(p){
    if (!p) return;
    actual = p;
    var r = document.documentElement.style;
    r.setProperty("--acento",       p.acento);
    r.setProperty("--acento-luz",   p.acentoLuz);
    r.setProperty("--acento-tenue", p.acentoTenue);
    r.setProperty("--din-1",        p.din1);
    r.setProperty("--din-2",        p.din2);
    r.setProperty("--panel",        p.panel);
    r.setProperty("--panel-2",      p.panel2);
    r.setProperty("--marco",        p.marco);
    r.setProperty("--texto",        p.texto);
    r.setProperty("--texto-tenue",  p.textoTenue);
    r.setProperty("--texto-mudo",   p.textoMudo);
    r.setProperty("--segunda",      p.segunda);
    pintarNavegador(p.din1);
  }

  /* El navegador también se pinta. En el móvil, la barra de arriba y la de los
     botones toman este color: sin él la pantalla acaba en dos franjas claras y
     el regalo deja de ocupar el teléfono entero. Como todo lo demás, el color
     sale de la paleta —la parada más clara del fondo, que es la que toca esas
     franjas—, nunca escrito a mano. La etiqueta se crea aquí y no en el HTML a
     propósito: escrita allí haría falta darle un color de partida, y ese sería
     justo el hex incrustado que aquí no queremos. */
  var etiquetaTono = null;
  function pintarNavegador(color){
    if (!color || !document.head) return;
    if (!etiquetaTono){
      etiquetaTono = document.querySelector('meta[name="theme-color"]');
      if (!etiquetaTono){
        etiquetaTono = document.createElement("meta");
        etiquetaTono.name = "theme-color";
        document.head.appendChild(etiquetaTono);
      }
    }
    etiquetaTono.setAttribute("content", color);
  }

  window.CalColor = {
    casa:      CASA,
    deMes:     deMes,
    deTexto:   deTexto,
    deCancion: deCancion,
    aplicar:   aplicar,
    /* Se lee de aquí, NUNCA de getComputedStyle: durante una transición el CSS
       devuelve el valor VIEJO, y un @property de color vuelve siempre como
       `rgb(...)`, nunca como el hex que escribiste. */
    ahora:     function(){ return actual; },
    hexDeLch:  hexDeLch,
    contraste: contraste
  };
})();
