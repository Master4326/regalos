/* ============================================================================
   perf.js  —  un solo sitio decide cuánto trabajo hace la página
   ----------------------------------------------------------------------------
   Todo el que quiera saber "¿cuántas partículas pinto?" o "¿ya toca frame?"
   pregunta aquí. Si mañana hay que ser más prudente en móviles se toca este
   archivo y ninguno más.

   Nadie DEPENDE de este archivo: todos preguntan con
       window.CalPerf ? CalPerf.cuantos(20) : 20
   así que si se borra, el calendario sigue funcionando como en un PC.
   ============================================================================ */
(function(){
  "use strict";

  /* ── qué aparato es ───────────────────────────────────────────────────────
     `pointer: coarse` distingue mejor que el ancho: un teléfono en horizontal
     pasa de 760 px y sigue siendo un teléfono, y una ventana estrecha en el PC
     no lo es. */
  var tactil  = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  var corto   = Math.min(window.innerWidth, window.innerHeight) <= 820;
  var movil   = !!(tactil || corto);
  var mem     = navigator.deviceMemory || 0;
  var nucleos = navigator.hardwareConcurrency || 0;

  /* Sin dato y siendo táctil suponemos aparato modesto: equivocarse por arriba
     se paga en tirones; por abajo, en unas lucecitas de menos que nadie echa
     en falta. */
  var bajo = movil && (mem <= 4 || nucleos <= 4);

  var quieto = !!(window.matchMedia &&
                  window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* Tres clases separadas, y `cal-tactil` va aparte de `cal-movil` a propósito:
     una ventana estrecha de escritorio es "móvil" para la carga de trabajo
     (conviene recortar) pero TIENE ratón, y lo que se toca con el dedo necesita
     otras reglas. */
  function marcar(){
    var b = document.body;
    if (!b) return;
    b.classList.toggle("cal-movil",  movil);
    b.classList.toggle("cal-bajo",   bajo);
    b.classList.toggle("cal-tactil", tactil);
    b.classList.toggle("cal-quieto", quieto);
  }
  if (document.body) marcar();
  else document.addEventListener("DOMContentLoaded", marcar);

  /* ── cuánto ───────────────────────────────────────────────────────────── */
  function cuantos(n){
    if (quieto) return 0;
    if (bajo)  return Math.max(3, Math.round(n * 0.34));
    if (movil) return Math.max(4, Math.round(n * 0.5));
    return n;
  }

  /* 30 fps en móvil: la mitad de trabajo y a simple vista no se nota. */
  function msFrame(){ return movil ? 33 : 0; }

  /* Reloj por bucle, para limitar fps sin setInterval. */
  function salta(estado, ahora){
    var min = msFrame();
    if (!min) return false;
    if (ahora - (estado.ultimo || 0) < min) return true;
    estado.ultimo = ahora;
    return false;
  }

  /* ── suavizado independiente de los fps ───────────────────────────────────
     Media app se escribe con `x += (objetivo - x) * k`, y esa k se aplica una
     vez por FRAME. Afinada a 60 Hz, en un monitor de 165 Hz corre 2,75 veces
     más seguido (todo nervioso) y en un móvil a 30 fps va espeso.

         k' = 1 - (1-k)^(dt/dt60)

     Así 0.12 significa LO MISMO a 30, 60, 144 o 240 Hz: el mismo tiempo real
     de caída. */
  var DT60 = 1000 / 60;
  function k(k60, dtMs){
    if (!(k60 > 0)) return 0;
    if (k60 >= 1)   return 1;
    /* tope de 100 ms: al volver de otra pestaña llega un salto enorme de dt
       y sin tope daría un TIRÓN. */
    var dt = Math.min(100, Math.max(1, dtMs || DT60));
    if (Math.abs(dt - DT60) < 1.5) return k60;
    return 1 - Math.pow(1 - k60, dt / DT60);
  }

  window.CalPerf = {
    movil:   movil,
    bajo:    bajo,
    tactil:  tactil,
    quieto:  quieto,
    cuantos: cuantos,
    msFrame: msFrame,
    salta:   salta,
    k:       k
  };
})();
