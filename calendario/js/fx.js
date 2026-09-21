/* ============================================================================
   fx.js  —  el reparto de animaciones
   ----------------------------------------------------------------------------
   Aquí no hay ni una animación: están todas en css/efectos.css. Lo que hay aquí
   es QUIÉN se lleva cuál, y ese reparto es la parte que hace que el regalo se
   sienta diseñado y no improvisado.

   La idea: pseudo-azar DETERMINISTA.
     · aleatorio de verdad  →  se siente caótico y no se puede probar
     · cíclico (1,2,3,1,2)  →  se nota a los tres días
     · determinista         →  el 14 de mayo SIEMPRE se abre igual, y mayo entero
                               tiene su propia secuencia, distinta de la de junio

   Así, si vuelves a un día, se comporta como lo recordabas. Eso es lo que hace
   que parezca escrito a mano para cada día.
   ============================================================================ */
(function(){
  "use strict";

  /* ── el picadillo y la semilla ──────────────────────────────────────────── */
  /* djb2 para convertir un texto en un número. */
  function picadillo(s){
    var h = 5381;
    s = String(s == null ? "" : s);
    for (var k = 0; k < s.length; k++) h = (Math.imul(h, 33) ^ s.charCodeAt(k)) | 0;
    return h | 0;
  }

  /* La sal de la canción abierta: hace que la MISMA línea número 3 tenga un
     efecto distinto en cada canción. */
  var sal = 0;
  function ponSal(txt){ sal = picadillo(txt); }

  /* Mezclado de avalancha (imul + xorshift). Sin él, un picadillo lineal saca
     los efectos SIEMPRE en el mismo orden y se nota enseguida: la línea 1 rise,
     la 2 slide, la 3 wave... Con esto, el orden es impredecible pero fijo. */
  function semilla(i, sal2, mod){
    var h = (Math.imul(i + 1, 2654435761) ^ Math.imul(sal2 | 0, 340573321) ^ sal) | 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h = (h ^ (h >>> 16)) >>> 0;
    return mod ? h % mod : h;
  }

  /* ── MANIFIESTO DE EFECTOS ──────────────────────────────────────────────── */
  /*  Una fila por efecto. Una sola fuente de verdad: las listas de abajo se
      DERIVAN de esta tabla. Antes de hacerlo así, esto vivía en cuatro listas
      sueltas y olvidarse de una dejaba el efecto invisible sin que fallara nada.

      n  nombre      la clase CSS del efecto
      t  dónde vale  'V' verso de la letra · 'E' entrada de la escena · 'VE' ambos
      i  intensidad  'h' se reserva a lo movido (líneas cortas, rápidas)
                     'c' se reserva a lo tranquilo (líneas largas, baladas)
                     ''  banda media, vale para todo
      l  letra       clase extra si el efecto revela LETRA a letra (si no, '')
      Para añadir un efecto: una fila aquí y su @keyframes en css/efectos.css.
      Nada más.                                                               */
  var FX = [
    ["vfx-sube",     "V",  "c", ""          ],  // sube desde abajo con desenfoque
    ["vfx-desliza",  "V",  "",  ""          ],  // entra alternando izquierda/derecha
    ["vfx-ola",      "V",  "",  ""          ],  // olita con rebote
    ["vfx-brisa",    "V",  "c", ""          ],  // suavísima, para lo lento
    ["vfx-columpio", "V",  "",  ""          ],  // colgadas de arriba, se columpian
    ["vfx-elastico", "V",  "h", ""          ],  // estirón elástico
    ["vfx-zoom",     "V",  "h", ""          ],  // llega gigante y se asienta
    ["vfx-voltea",   "V",  "h", ""          ],  // volteo 3D desde abajo (rotateX)
    ["vfx-teclea",   "V",  "c", "vl-teclea" ],  // tecleo, letra a letra
    ["vfx-cae",      "V",  "h", "vl-cae"    ],  // las letras caen y rebotan
    ["vfx-neon",     "V",  "c", "vl-neon"   ],  // letrero de neón encendiéndose
    ["vfx-gira",     "V",  "h", "vl-gira"   ],  // las letras giran como una puerta
    ["efx-enfoca",   "E",  "",  ""          ],  // desenfocada que enfoca
    ["efx-sube",     "E",  "c", ""          ],
    ["efx-sello",    "E",  "h", ""          ],  // cae como un sello
    ["efx-cortina",  "E",  "",  ""          ],  // se descubre de abajo arriba
    ["efx-abanico",  "E",  "",  ""          ],  // gira un pelo al entrar
    ["efx-respira",  "E",  "c", ""          ]   // crece muy despacio desde dentro
  ];

  /* Listas derivadas — nunca escritas a mano. */
  function conTipo(t){ return FX.filter(function(f){ return f[1].indexOf(t) !== -1; }); }
  var VERSOS = conTipo("V");
  var ESCENA = conTipo("E");
  var LETRA  = {};
  FX.forEach(function(f){ if (f[3]) LETRA[f[0]] = f[3]; });

  /* Filtra por intensidad. La banda media ('') se queda con TODO: es la que más
     casos recibe y merece la variedad entera. Y si un filtro deja la lista
     vacía, se devuelve entera: más vale un efecto de otra banda que ninguno. */
  function banda(lista, i){
    if (!i) return lista;
    var r = lista.filter(function(f){ return f[2] === i || f[2] === ""; });
    return r.length ? r : lista;
  }

  /* ── partir una frase ───────────────────────────────────────────────────── */
  /* Devuelve los trozos con su HTML ya escapado. El signo --sx alterna -1 / 1
     para los efectos que tienen dirección. */
  function escapa(s){
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function trozos(texto, porLetra){
    if (porLetra){
      return String(texto).split("").map(function(ch){
        return ch === " " ? " " : ch;
      });
    }
    return String(texto).split(/(\s+)/).filter(function(t){ return t.length; });
  }

  /* ── el escalonado se reparte por DURACIÓN, no por número de trozos ─────── */
  /* Una frase que dura 5 s se revela despacio; una de 1,2 s se revela de golpe.
     Repartir por número de palabras hace justo lo contrario de lo que pide la
     música: las frases largas (que suelen tener más palabras) saldrían
     disparadas. */
  function ventana(dur){
    var d = Math.min(7, Math.max(1.2, dur || 3));
    return Math.min(1.15, d * 0.24);          // segundos de revelado
  }

  /* Pinta el verso partido en trozos, con su efecto y sus retardos.
       el   : el div del verso
       i    : índice de la línea (para la semilla)
       dur  : cuánto dura cantada, en segundos
     Devuelve la clase de efecto que le tocó. */
  function verso(el, i, dur){
    if (!el || el.dataset.partido === "1") return el && el.dataset.fx;

    var txt = el.textContent;
    if (!txt || !txt.trim()){ el.dataset.partido = "1"; return ""; }

    /* Las líneas cortas se llevan lo movido; las largas, lo tranquilo. */
    var d = dur || 3;
    var lista = banda(VERSOS, d < 2.0 ? "h" : (d > 4.2 ? "c" : ""));
    var f = lista[semilla(i, 7, lista.length)];
    var clase = f[0], claseLetra = f[3];
    var porLetra = !!claseLetra;

    var partes = trozos(txt, porLetra);
    var vent = ventana(d);
    /* Cuento solo los trozos que se ven: los espacios no gastan turno. */
    var visibles = partes.filter(function(p){ return p.trim().length; }).length || 1;
    var paso = vent / visibles;

    /* La palabra más larga se lleva el tamaño y el brillo. Es lo que evita que
       la frase se lea como una masa uniforme: siempre manda UNA, nunca dos. */
    var mayor = -1, largo = 0;
    partes.forEach(function(p, k){
      if (!porLetra && p.trim().length > largo){ largo = p.trim().length; mayor = k; }
    });

    var html = "", n = 0, enPalabra = false;
    for (var k = 0; k < partes.length; k++){
      var p = partes[k];
      if (!p.trim().length){
        if (enPalabra){ html += "</span>"; enPalabra = false; }
        html += escapa(p);
        continue;
      }
      /* Repartiendo LETRA a letra, cada letra es un elemento suelto y el
         navegador puede cortar la línea ENTRE dos de ellas: "y me iba bas /
         tante bien". Por eso cada palabra va dentro de un envoltorio que no se
         deja partir. Repartiendo por palabras no hace falta: los espacios ya
         son los únicos sitios por donde se puede cortar. */
      if (porLetra && !enPalabra){ html += '<span class="pal">'; enPalabra = true; }
      var retardo = (n * paso).toFixed(3);
      var signo = (n % 2) ? 1 : -1;
      html += '<span class="p' + (k === mayor && largo >= 5 ? " p-grande" : "") + '"'
            + ' style="--d:' + retardo + 's;--sx:' + signo + '">'
            + escapa(p) + '</span>';
      n++;
    }
    if (enPalabra) html += "</span>";

    el.innerHTML = html;
    el.classList.add(clase);
    if (claseLetra) el.classList.add(claseLetra);
    el.dataset.fx = clase;
    el.dataset.partido = "1";
    return clase;
  }

  /* ── KARAOKE: el verso vivo se tiñe palabra a palabra ─────────────────────
     Esto es lo que hace que la letra siga a la VOZ y no solo a la línea. Está
     portado del reproductor Master Music, donde lleva tiempo funcionando.

     Un .lrc solo trae el arranque de CADA VERSO, nunca el de cada palabra. El
     reparto va por longitud (letras + 1 por palabra), que es la aproximación
     de toda la vida y se ve clavada: las palabras largas se cantan despacio y
     las cortas de paso.

     Dos reglas que aquí no se rompen:

     1. Solo se tocan CLASES. Nunca se reconstruye el HTML del verso: los
        <span> los creó verso() con su animación de entrada, y reescribir el
        innerHTML la cortaría a media frase.

     2. En el CSS, el teñido solo pinta `color` y `text-shadow`. Ni transform,
        ni opacity, ni animation: esos tres canales son de los efectos de
        entrada de la línea, y pisarlos deja la primera palabra congelada.
        (Es exactamente la misma lección que ya se aprendió en el reproductor.)  */

  /* Devuelve, para cada trozo, en qué punto del verso (0…1) le toca sonar. */
  function repartir(els){
    var out = [], peso = [], total = 0, i;
    for (i = 0; i < els.length; i++){
      peso[i] = (els[i].textContent || "").trim().length + 1;
      total += peso[i];
    }
    if (!total) return out;
    var acc = 0;
    for (i = 0; i < els.length; i++){
      out.push({ el: els[i], s: acc / total });
      acc += peso[i];
    }
    return out;
  }

  /* p = cuánto llevas cantado de ESTE verso, de 0 a 1.
       .sung     → ya sonó
       .cantando → suena ahora mismo (solo una a la vez)              */
  function karaoke(el, p){
    if (!el) return;
    var lista = el._kw, i;
    /* Se comprueba la REFERENCIA, no la longitud: una lista vacía (un verso en
       blanco) también es caché buena, y sin esto se volvería a preguntar al
       DOM en cada fotograma. */
    if (!lista || (lista.length && !lista[0].el.isConnected)){
      lista = el._kw = repartir(el.querySelectorAll(".p"));
      el._kn = 0;
    }
    if (!lista.length) return;

    var n = el._kn || 0;
    if (!(p > 0)) p = 0;
    /* Rebobinaste dentro del mismo verso: se apaga entero y vuelve a empezar. */
    if (n && p < lista[n - 1].s){
      for (i = 0; i < lista.length; i++) lista[i].el.classList.remove("sung", "cantando");
      n = 0;
    }
    var cambio = false;
    while (n < lista.length && p >= lista[n].s){
      lista[n].el.classList.add("sung");
      n++; cambio = true;
    }
    el._kn = n;
    /* Sin cambio no se toca nada: repasar treinta spans por fotograma para
       dejarlos igual es trabajo tirado. */
    if (!cambio) return;
    for (i = 0; i < lista.length; i++) lista[i].el.classList.toggle("cantando", i === n - 1);
  }

  /* ── token por operación ────────────────────────────────────────────────── */
  /* Si una animación programa un temporizador y mientras tanto cambia la línea,
     el temporizador viejo llega tarde y pisa lo nuevo. Cada operación se lleva
     un número; al vencer, comprueba que sigue siendo la suya. */
  var cuenta = 0;
  function marca(el){
    var t = String(++cuenta);
    if (el) el.dataset.rev = t;
    return t;
  }
  function sigueSiendo(el, t){ return !!el && el.dataset.rev === t; }

  /* ── efecto de entrada de la escena de un día ───────────────────────────── */
  /* semilla(díaDelMes, mes) → cada día tiene SU forma de abrirse, y siempre la
     misma. Vuelves a agosto y agosto se comporta igual que la última vez. */
  function escena(dia, mes){
    var lista = ESCENA;
    return lista[semilla(dia, mes + 1, lista.length)][0];
  }

  /* ── entrada de la rejilla del mes ──────────────────────────────────────── */
  /* Aquí NO se sortea por casilla: 31 animaciones distintas a la vez es ruido.
     El mes entero elige UNA forma de entrar y las casillas se escalonan dentro
     de ella. La variedad la pone el mes, no cada cuadrito. */
  var REJILLA = ["rej-sube", "rej-abre", "rej-baraja", "rej-lejos"];
  function rejilla(mes, anio){
    return REJILLA[semilla(mes, anio, REJILLA.length)];
  }

  window.CalFx = {
    picadillo:     picadillo,
    ponSal:        ponSal,
    semilla:       semilla,
    verso:         verso,
    karaoke:       karaoke,
    escena:        escena,
    rejilla:       rejilla,
    marca:         marca,
    sigueSiendo:   sigueSiendo,
    /* Se exponen para que las pruebas puedan comprobar que toda fila del
       manifiesto tiene su CSS y que ninguna clase de CSS se ha quedado huérfana. */
    manifiesto:    FX,
    clasesRejilla: REJILLA,
    clasesLetra:   LETRA
  };
})();
