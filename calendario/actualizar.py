# -*- coding: utf-8 -*-
"""
actualizar.py  —  rellena canciones.js a partir de los archivos de las carpetas.

Cómo usarlo
-----------
1. Suelta los archivos con el nombre de la fecha, AAAA-MM-DD:

       audio/2026-09-21.mp3                        <- la canción
       audio/2026-09-21 - Artista - Título.mp3     <- (opcional) así rellena solo el nombre
       letras/2026-09-21.lrc                       <- letra sincronizada (karaoke)
       letras/2026-09-21.txt                       <- o letra en texto plano
       portadas/2026-09-21.jpg                     <- carátula
       notas/2026-09-21.txt                        <- tu texto de "por qué esta canción"

2. Doble clic en ACTUALIZAR.bat  (o en consola:  py actualizar.py)

El título y el artista se sacan, por este orden:
   1) del nombre del archivo, si lleva el formato "fecha - artista - título"
   2) de las etiquetas internas del mp3, si tienes instalado `mutagen`
      (opcional:  py -m pip install mutagen)
   3) si no, quedan en blanco y los escribes a mano en canciones.js

Este script reescribe canciones.js entero. Antes guarda una copia en
canciones.js.bak. NUNCA toca config.js.
"""

import json
import re
import shutil
import sys
import unicodedata
from datetime import date
from pathlib import Path

BASE = Path(__file__).resolve().parent

CARPETA_AUDIO    = BASE / "audio"
CARPETA_LETRAS   = BASE / "letras"
CARPETA_PORTADAS = BASE / "portadas"
CARPETA_NOTAS    = BASE / "notas"
CARPETA_TRAD     = BASE / "traducciones"
SALIDA           = BASE / "canciones.js"

EXT_AUDIO    = (".mp3", ".m4a", ".ogg", ".opus", ".wav", ".flac", ".aac")
EXT_PORTADA  = (".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif")

FECHA_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})")
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
         "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


# ---------------------------------------------------------------- utilidades

def leer_texto(ruta):
    """Lee un archivo probando las codificaciones habituales en Windows."""
    for cod in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return ruta.read_text(encoding=cod)
        except (UnicodeDecodeError, LookupError):
            continue
    return ruta.read_bytes().decode("utf-8", errors="replace")


def fecha_de(ruta):
    """Devuelve 'AAAA-MM-DD' si el nombre del archivo empieza por una fecha."""
    m = FECHA_RE.match(ruta.stem)
    if not m:
        return None
    try:
        partes = [int(x) for x in m.group(1).split("-")]
        date(*partes)           # valida que la fecha exista de verdad
    except ValueError:
        return None
    return m.group(1)


def nombre_bonito(clave):
    """'2026-09-21' -> '21 de septiembre'"""
    y, mo, d = (int(x) for x in clave.split("-"))
    return "%d de %s" % (d, MESES[mo - 1])


def partes_del_nombre(ruta, clave):
    """
    Saca (artista, titulo) del nombre del archivo.
      '2026-09-21 - Radiohead - Creep'  -> ('Radiohead', 'Creep')
      '2026-09-21 - Creep'              -> ('', 'Creep')
      '2026-09-21'                      -> ('', '')
    """
    resto = ruta.stem[len(clave):].strip(" -_")
    if not resto:
        return "", ""
    trozos = [t.strip() for t in resto.split(" - ") if t.strip()]
    if len(trozos) >= 2:
        return trozos[0], " - ".join(trozos[1:])
    return "", trozos[0]


def etiquetas_mp3(ruta):
    """(artista, titulo, portada_bytes) leídos del propio archivo, si se puede."""
    try:
        import mutagen  # opcional: py -m pip install mutagen
    except ImportError:
        return "", "", None

    try:
        f = mutagen.File(ruta)
        if f is None:
            return "", "", None
        titulo = artista = ""
        tags = getattr(f, "tags", None) or {}

        def primero(*claves):
            for k in claves:
                v = tags.get(k)
                if v:
                    if isinstance(v, list):
                        v = v[0]
                    return str(v).strip()
            return ""

        titulo  = primero("TIT2", "title", "\xa9nam")
        artista = primero("TPE1", "artist", "\xa9ART")

        portada = None
        try:
            for k in getattr(tags, "keys", lambda: [])():
                if str(k).startswith("APIC"):
                    portada = tags[k].data
                    break
            if portada is None and getattr(f, "pictures", None):
                portada = f.pictures[0].data
            if portada is None and "covr" in tags:
                portada = bytes(tags["covr"][0])
        except Exception:
            portada = None

        return artista, titulo, portada
    except Exception:
        return "", "", None


def parsear_lrc(texto):
    """
    '[00:12.40]línea'  ->  [{'t': 12.4, 'texto': 'línea'}, ...]
    Admite varios sellos de tiempo en la misma línea y los ordena.
    Devuelve [] si el archivo no tiene ningún sello de tiempo.
    """
    marca = re.compile(r"\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]")
    salida = []
    for linea in texto.splitlines():
        tiempos = list(marca.finditer(linea))
        if not tiempos:
            continue
        cuerpo = linea[tiempos[-1].end():].strip()
        for m in tiempos:
            mm  = int(m.group(1))
            ss  = int(m.group(2))
            fr  = m.group(3) or "0"
            # 1 dígito = décimas, 2 = centésimas, 3 = milésimas
            dec = int(fr) / (10.0 ** len(fr))
            salida.append({"t": round(mm * 60 + ss + dec, 2), "texto": cuerpo})
    salida.sort(key=lambda x: x["t"])
    return salida


def parsear_plano(texto):
    """Texto plano -> lista de líneas, recortando los blancos de los extremos."""
    lineas = [l.rstrip() for l in texto.splitlines()]
    while lineas and not lineas[0].strip():
        lineas.pop(0)
    while lineas and not lineas[-1].strip():
        lineas.pop()
    return lineas


def indexar(carpeta, extensiones=None):
    """{'2026-09-21': Path(...)} para los archivos que empiezan por una fecha."""
    encontrados = {}
    if not carpeta.is_dir():
        return encontrados
    for ruta in sorted(carpeta.iterdir()):
        if not ruta.is_file() or ruta.name.startswith("."):
            continue
        if extensiones and ruta.suffix.lower() not in extensiones:
            continue
        clave = fecha_de(ruta)
        if clave:
            encontrados.setdefault(clave, ruta)
    return encontrados


# ---------------------------------------------------------------- traducción

# Homoglifos: LRCLIB es comunitario y por sus letras se cuelan cirílicas que se
# ven igual que las latinas. Si la clave tuviera que coincidir byte a byte,
# media traducción se perdería sin que nadie se enterase.
HOMOGLIFOS = str.maketrans({
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x",
    "і": "i", "ѕ": "s", "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
})


def clave_verso(texto):
    """Forma normalizada de un verso, para emparejarlo con su traducción."""
    t = str(texto).lower().translate(HOMOGLIFOS)
    t = unicodedata.normalize("NFD", t)
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9']+", " ", t).strip()


def leer_traduccion(ruta):
    """traducciones/AAAA-MM-DD.txt  →  {verso normalizado: traducción}

    Una línea por verso, con el original y el español separados por ' ||| '.
    Como se busca por CONTENIDO y no por número de línea, da igual que la letra
    cambie de orden o que un estribillo se repita: todas sus repeticiones
    reciben la misma traducción, y las líneas que no estén se quedan sin ella
    en vez de descolocar el resto.
    """
    tabla = {}
    for linea in leer_texto(ruta).splitlines():
        if "|||" not in linea:
            continue
        original, _, espanol = linea.partition("|||")
        original, espanol = original.strip(), espanol.strip()
        if original and espanol:
            tabla[clave_verso(original)] = espanol
    return tabla


# ------------------------------------------------------- lo que ya había

def leer_lo_puesto():
    """{'2026-09-21': {'titulo': ..., 'artista': ...}} del canciones.js actual.

    El título y el artista salen del NOMBRE del mp3. Un día que todavía no
    tiene su audio se quedaba en "Canción del 21 de agosto" y perdía el que ya
    le habías puesto: ejecutar el script antes de tener toda la música borraba
    medio calendario. Con esto, lo que ya estaba escrito hace de red.

    Se lee con expresiones regulares a propósito: aquí no hay intérprete de
    JavaScript, y el archivo lo genera este mismo script, así que su forma se
    conoce. Si alguien lo edita a mano y algo no encaja, simplemente no se
    encuentra ese día y se sigue como antes.
    """
    puesto = {}
    if not SALIDA.exists():
        return puesto
    try:
        crudo = SALIDA.read_text(encoding="utf-8")
    except OSError:
        return puesto
    for bloque in re.finditer(r'"(\d{4}-\d{2}-\d{2})"\s*:\s*\{(.*?)\n  \}', crudo, re.S):
        clave, cuerpo = bloque.group(1), bloque.group(2)
        datos = {}
        for campo in ("titulo", "artista"):
            m = re.search(campo + r'\s*:\s*"((?:[^"\\]|\\.)*)"', cuerpo)
            if m:
                try:
                    datos[campo] = json.loads('"' + m.group(1) + '"')
                except ValueError:
                    pass
        if datos:
            puesto[clave] = datos
    return puesto


def rel(ruta):
    """Ruta relativa a la carpeta del regalo, con barras normales."""
    return ruta.relative_to(BASE).as_posix()


def js(valor):
    return json.dumps(valor, ensure_ascii=False)


# ---------------------------------------------------------------- programa

SIN_PERMISO = '<>:"/\\|?*'          # lo que Windows no deja en un nombre de archivo


def nombre_archivo(texto):
    """Deja un texto en condiciones de ser parte de un nombre de archivo."""
    return "".join(c for c in texto if c not in SIN_PERMISO).strip()


def escribir_papeles(programa):
    """
    Los dos papeles de quien MONTA el regalo:

        PROGRAMA-<MES>.txt    qué canción va cada día y cuáles ya suenan
        FALTAN-ESTOS-MP3.txt  los mp3 que quedan, con el nombre exacto

    Los escribe el script a propósito. Cuando se llevaban a mano se quedaban con
    las fechas del mes anterior mientras el calendario ya se había mudado, y el
    papel decía una cosa y el calendario otra.
    """
    if not programa:
        return

    mes = int(programa[0][0][5:7])
    anio = programa[0][0][:4]
    primero = programa[0][0][:7]

    titular = "UN AÑO DE CANCIONES — %s de %s" % (MESES[mes - 1], anio)
    lineas = [titular, "=" * len(titular), ""]
    for clave, titulo, artista, suena in programa:
        # Los días que se salen del mes llevan su fecha detrás: si no, se leen
        # como un "1" repetido al final de la lista y parece un error.
        fuera = "   (%s)" % nombre_bonito(clave) if clave[:7] != primero else ""
        lineas.append("%2d  [%s]  %s%s%s" % (
            int(clave[8:]), "suena" if suena else "falta",
            (artista + " — ") if artista else "", titulo, fuera))

    faltan = [p for p in programa if not p[3]]
    lineas += ["",
               "Las %d canciones están puestas; el mp3 de cada una va en audio/."
               % len(programa)]
    lineas.append("Ya suenan %d; faltan %d." % (len(programa) - len(faltan), len(faltan))
                  if faltan else "Suenan todas.")
    lineas.append("Los enlaces de compra están en COMPRAR-CANCIONES.txt.")

    # Un solo papel de programa: el del mes anterior sobraba y confundía.
    for viejo in BASE.glob("PROGRAMA-*.txt"):
        viejo.unlink()
    (BASE / ("PROGRAMA-%s.txt" % MESES[mes - 1].upper())).write_text(
        "\n".join(lineas) + "\n", encoding="utf-8")

    if faltan:
        # Escrito con las dos frases enteras: "canción" + "es" sale "canciónes",
        # y un papel que se lee con una falta de ortografía se lee peor.
        cabecera = ("Falta 1 canción. Suéltala en audio/ con EXACTAMENTE este nombre"
                    if len(faltan) == 1 else
                    "Faltan %d canciones. Suéltalas en audio/ con EXACTAMENTE este nombre"
                    % len(faltan))
        pendientes = [cabecera,
                      "(o con el nombre que traigan, y luego ejecuta ACTUALIZAR.bat).", ""]
        for clave, titulo, artista, _ in faltan:
            pendientes.append("  %s%s.mp3" % (
                clave + (" - " + nombre_archivo(artista) if artista else ""),
                " - " + nombre_archivo(titulo)))
        pendientes += ["", "Los enlaces de compra están en COMPRAR-CANCIONES.txt"]
        (BASE / "FALTAN-ESTOS-MP3.txt").write_text(
            "\n".join(pendientes) + "\n", encoding="utf-8")
    else:
        # Sin huecos no hay lista que leer: dejarla ahí solo haría dudar.
        pendiente = BASE / "FALTAN-ESTOS-MP3.txt"
        if pendiente.exists():
            pendiente.unlink()


def main():
    audios   = indexar(CARPETA_AUDIO, EXT_AUDIO)
    letras   = indexar(CARPETA_LETRAS)
    portadas = indexar(CARPETA_PORTADAS, EXT_PORTADA)
    notas    = indexar(CARPETA_NOTAS, (".txt", ".md"))
    traducs  = indexar(CARPETA_TRAD, (".txt",))
    anterior = leer_lo_puesto()

    claves = sorted(set(audios) | set(letras) | set(portadas) | set(notas))

    if not claves:
        print("No he encontrado ningún archivo con nombre de fecha.")
        print()
        print("Prueba a soltar algo así y vuelve a ejecutarme:")
        print("   audio/2026-09-21 - Artista - Titulo.mp3")
        print("   letras/2026-09-21.lrc")
        print("   notas/2026-09-21.txt")
        return 1

    entradas = []
    programa = []
    avisos = []
    n_letras_sync = n_letras_planas = n_portadas = n_notas = n_trad = 0

    for clave in claves:
        artista = titulo = ""
        ruta_audio = audios.get(clave)

        if ruta_audio:
            artista, titulo = partes_del_nombre(ruta_audio, clave)
            if not titulo or not artista:
                a2, t2, portada_incrustada = etiquetas_mp3(ruta_audio)
                titulo  = titulo  or t2
                artista = artista or a2
                # si el mp3 lleva carátula dentro y no hay una suelta, la extraemos
                if portada_incrustada and clave not in portadas:
                    CARPETA_PORTADAS.mkdir(exist_ok=True)
                    destino = CARPETA_PORTADAS / (clave + ".jpg")
                    try:
                        destino.write_bytes(portada_incrustada)
                        portadas[clave] = destino
                    except OSError:
                        pass
        else:
            avisos.append("%s  tiene material pero no tiene audio" % clave)

        # La red: lo que ya estaba escrito para ese día manda sobre el invento.
        previo = anterior.get(clave, {})
        if not titulo:
            titulo = previo.get("titulo", "")
        if not artista:
            artista = previo.get("artista", "")

        if not titulo:
            titulo = "Canción del " + nombre_bonito(clave)
            avisos.append("%s  sin título: ponlo a mano o renombra el mp3" % clave)

        campos = ["titulo:  " + js(titulo)]
        if artista:
            campos.append("artista: " + js(artista))
        if ruta_audio:
            campos.append("audio:   " + js(rel(ruta_audio)))
        if clave in portadas:
            campos.append("portada: " + js(rel(portadas[clave])))
            n_portadas += 1

        if clave in notas:
            texto_nota = leer_texto(notas[clave]).strip()
            if texto_nota:
                campos.append("nota:    " + js(texto_nota))
                n_notas += 1

        if clave in letras:
            crudo = leer_texto(letras[clave])
            # La traducción de ese día, si la hay. Lo que se LEE en pantalla es
            # el español; el original queda debajo, escondido tras un botón.
            trad = leer_traduccion(traducs[clave]) if clave in traducs else {}
            if trad:
                n_trad += 1
            sincronizada = parsear_lrc(crudo)
            if sincronizada:
                def verso(linea):
                    es = trad.get(clave_verso(linea["texto"]))
                    return "{ t: %s, texto: %s%s }" % (
                        linea["t"], js(linea["texto"]),
                        (", trad: " + js(es)) if es else "")
                filas = ",\n      ".join(verso(l) for l in sincronizada)
                campos.append("letra: [\n      " + filas + "\n    ]")
                n_letras_sync += 1
            else:
                planas = parsear_plano(crudo)
                if planas:
                    def verso_plano(texto):
                        es = trad.get(clave_verso(texto))
                        return ("{ texto: %s, trad: %s }" % (js(texto), js(es))) if es else js(texto)
                    filas = ",\n      ".join(verso_plano(l) for l in planas)
                    campos.append("letra: [\n      " + filas + "\n    ]")
                    n_letras_planas += 1

        entradas.append('  %s: {\n    %s\n  }' % (js(clave), ",\n    ".join(campos)))
        programa.append((clave, titulo, artista, bool(ruta_audio)))

    cabecera = (
        "/* ============================================================================\n"
        "   canciones.js  —  GENERADO POR actualizar.py\n"
        "   ----------------------------------------------------------------------------\n"
        "   No edites este archivo a mano si vas a volver a ejecutar el script:\n"
        "   lo reescribe entero cada vez.\n"
        "\n"
        "     · las notas van en   notas/AAAA-MM-DD.txt\n"
        "     · las letras van en  letras/AAAA-MM-DD.lrc  (o .txt)\n"
        "     · las traducciones,  traducciones/AAAA-MM-DD.txt\n"
        "       (una línea por verso:  original ||| en español)\n"
        "     · el año y el título están en config.js, que el script nunca toca\n"
        "   ============================================================================ */\n\n"
    )
    contenido = cabecera + "const CANCIONES = {\n\n" + ",\n\n".join(entradas) + "\n\n};\n"

    if SALIDA.exists():
        shutil.copy2(SALIDA, SALIDA.with_suffix(".js.bak"))
    SALIDA.write_text(contenido, encoding="utf-8")

    escribir_papeles(programa)

    print("Listo. canciones.js reescrito.")
    print()
    print("   dias con contenido ..... %d" % len(claves))
    print("   con audio .............. %d" % len(audios))
    print("   con letra karaoke ...... %d" % n_letras_sync)
    print("   con letra plana ........ %d" % n_letras_planas)
    print("   con caratula ........... %d" % n_portadas)
    print("   con nota personal ...... %d" % n_notas)

    if avisos:
        print()
        print("Cosas que quiza quieras revisar:")
        for a in avisos[:15]:
            print("   - " + a)
        if len(avisos) > 15:
            print("   ... y %d mas" % (len(avisos) - 15))

    print()
    print("Abre index.html para verlo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
