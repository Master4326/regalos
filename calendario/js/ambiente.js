/* ============================================================================
   ambiente.js  —  el fondo vivo de la escena de una canción
   ----------------------------------------------------------------------------
   Tres capas, todas por DEBAJO del texto y sin capturar el ratón:

     1. el aura   — cuatro manchas difusas con los colores de la paleta
     2. el marco  — cuatro esquinas quietas y tenues
     3. las notas — partículas que suben mientras suena

   LA REGLA DE ORO: el ambiente NO PARPADEA. No hay nada aquí que se encienda y
   se apague por golpe. Lo que hay son derivas de 20 a 40 segundos: al mirar dos
   veces seguidas parece lo mismo, y al volver dentro de un minuto está en otro
   sitio. Un fondo que titila cansa en diez segundos y estropea el texto, que es
   lo que de verdad importa en esta pantalla.

   Las duraciones de las manchas (23 / 27 / 34 / 41 s) no son redondas y son
   primas entre sí a propósito: la combinación de las cuatro tarda muchísimo en
   repetirse, así que nunca se le ve el bucle.
   ============================================================================ */
(function(){
  "use strict";

  var GLIFOS = ["♪", "♫", "✦", "·", "♬"];

  var caja = null;      // el contenedor del ambiente
  var lazo = 0;         // id del requestAnimationFrame
  var siembra = 0;      // id del temporizador de partículas
  var energia = 0;      // valor suavizado que mueve la opacidad del aura
  var objetivo = 0.35;
  var reloj = { ultimo: 0 };
  var previo = 0;

  function perf(){ return window.CalPerf; }
  function cuantos(n){ return perf() ? perf().cuantos(n) : n; }
  function quieto(){ return !!(perf() && perf().quieto); }

  /* ── montar ─────────────────────────────────────────────────────────────── */
  function montar(padre){
    desmontar();
    if (!padre) return;

    caja = document.createElement("div");
    caja.className = "amb";
    caja.setAttribute("aria-hidden", "true");

    /* El aura: cuatro manchas, cada una con su tamaño, su sitio y su deriva. */
    var manchas = [
      { c: "a", dur: "23s", x: "18%", y: "22%", d: "0s"   },
      { c: "b", dur: "34s", x: "78%", y: "30%", d: "-6s"  },
      { c: "c", dur: "27s", x: "30%", y: "76%", d: "-13s" },
      { c: "d", dur: "41s", x: "72%", y: "82%", d: "-21s" }
    ];
    var html = "";
    if (!quieto()){
      manchas.forEach(function(m){
        html += '<div class="amb-mancha amb-' + m.c + '" style="'
              + "--mx:" + m.x + ";--my:" + m.y + ";--mdur:" + m.dur + ";--mret:" + m.d
              + '"></div>';
      });
    }

    /* El marco de esquinas: cuatro divs con dos bordes cada uno. Van QUIETOS.
       Cuando latían, al encenderse los cuatro a la vez se leían como un cuadrado
       que aparecía por detrás del texto — que es justo lo que molesta. */
    html += '<div class="amb-esquina ar"></div><div class="amb-esquina ad"></div>'
          + '<div class="amb-esquina br"></div><div class="amb-esquina bd"></div>';

    caja.innerHTML = html;
    padre.appendChild(caja);

    previo = 0;
    energia = 0.2;
    arranca();
  }

  function desmontar(){
    if (lazo) cancelAnimationFrame(lazo);
    if (siembra) clearInterval(siembra);
    lazo = siembra = 0;
    if (caja && caja.parentNode) caja.parentNode.removeChild(caja);
    caja = null;
    document.body.classList.remove("sonando");
  }

  /* ── la energía: un solo valor, escrito UNA vez por frame ───────────────── */
  /* Se escribe en el CONTENEDOR y lo heredan las cuatro manchas. Una escritura
     por mancha y por frame serían dieciséis; así es una.

     El suavizado usa CalPerf.k para que 0.014 signifique lo mismo a 30, 60 o
     144 Hz. Sin eso, en un monitor rápido el aura se despierta casi tres veces
     antes de lo previsto y en un móvil va espesa. */
  function paso(ahora){
    if (!caja){ lazo = 0; return; }          // la escena se cerró a mitad de frame
    lazo = requestAnimationFrame(paso);
    if (perf() && perf().salta(reloj, ahora)) return;

    var dt = previo ? ahora - previo : 16.7;
    previo = ahora;

    var k = perf() ? perf().k(0.014, dt) : 0.014;
    energia += (objetivo - energia) * k;
    caja.style.setProperty("--energia", energia.toFixed(4));
  }

  function arranca(){
    if (quieto() || !caja) return;
    lazo = requestAnimationFrame(paso);
  }

  /* ── partículas ─────────────────────────────────────────────────────────── */
  /* Todas las variables se escriben UNA vez, al crearla. Nada por frame: la
     animación la lleva el CSS entera. */
  function nota(){
    if (!caja) return;
    var vivas = caja.querySelectorAll(".amb-nota").length;
    if (vivas >= cuantos(12)) return;

    var el = document.createElement("div");
    el.className = "amb-nota";
    var g = GLIFOS[Math.floor(Math.random() * GLIFOS.length)];
    el.style.cssText =
      "--nx:" + (4 + Math.random() * 92).toFixed(1) + "%;" +
      "--ndx:" + (Math.random() * 70 - 35).toFixed(0) + "px;" +
      "--nh:" + (240 + Math.random() * 300).toFixed(0) + "px;" +
      "--ndur:" + (7 + Math.random() * 7).toFixed(1) + "s;" +
      "--nfs:" + (11 + Math.random() * 12).toFixed(0) + "px;" +
      "--nop:" + (0.12 + Math.random() * 0.2).toFixed(2) + ";" +
      "--nrot:" + (Math.random() * 50 - 25).toFixed(0) + "deg";
    /* El glifo va en un hijo porque .amb-nota ya gasta SU transform en la
       subida. Un elemento, un transform. */
    el.innerHTML = "<i>" + g + "</i>";
    el.addEventListener("animationend", function(){
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    caja.appendChild(el);
  }

  /* ── sonando / en pausa ─────────────────────────────────────────────────── */
  /* Con la canción parada el ambiente se congela (una línea de CSS lo hace) y
     deja de nacer nada. El fondo no tiene por qué seguir trabajando cuando no
     hay nada que acompañar. */
  function sonando(si){
    document.body.classList.toggle("sonando", !!si);
    objetivo = si ? 1 : 0.3;
    if (siembra){ clearInterval(siembra); siembra = 0; }
    if (si && !quieto() && caja){
      nota();
      siembra = setInterval(nota, perf() && perf().movil ? 2200 : 1400);
    }
  }

  /* Si la pestaña se va a segundo plano no tiene sentido seguir sembrando. */
  document.addEventListener("visibilitychange", function(){
    if (document.hidden && siembra){ clearInterval(siembra); siembra = 0; }
    else if (!document.hidden && document.body.classList.contains("sonando")) sonando(true);
  });

  window.CalAmbiente = {
    montar:     montar,
    desmontar:  desmontar,
    sonando:    sonando
  };
})();
