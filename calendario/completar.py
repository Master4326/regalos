# -*- coding: utf-8 -*-
"""
completar.py  —  rellena de internet lo que les falta a tus canciones.

Qué hace
--------
Mira los archivos de audio/ y, para cada canción, descarga lo que no tengas:

    · la letra sincronizada   →  letras/AAAA-MM-DD.lrc     (de lrclib.net)
    · la carátula del disco   →  portadas/AAAA-MM-DD.jpg   (de iTunes)

Las dos fuentes son gratuitas y no piden registro ni clave.

Cómo usarlo
-----------
    Doble clic en COMPLETAR.bat
    (o en consola:  py completar.py)

    --forzar           vuelve a bajar lo que ya tenías
    --solo-letras      no toca las carátulas
    --solo-caratulas   no toca las letras
    --tamano 1000      carátulas más grandes (100 a 2000, por defecto 600)

Para que acierte, el archivo de audio tiene que dejar claro qué canción es.
Lo mejor es nombrarlo así:

    audio/2026-09-21 - Radiohead - Creep.mp3

Si el mp3 lleva bien puestas sus etiquetas internas, también le valen.

Por qué mira la duración
------------------------
Tanto en LRCLIB como en iTunes hay varias versiones de casi todo: el single,
la del álbum, un directo, una acústica, una remasterización. Si coge la que
no es, la letra va desincronizada y la carátula es la de otro disco.

Buscando "radiohead creep", por ejemplo, el primer resultado de iTunes es la
versión acústica del EP, no la de Pablo Honey. Por eso el script mide tu
archivo y se queda con la versión cuya duración más se le parece.

Sé amable con estos servicios: son gratis y los mantiene gente. El script ya
espera entre peticiones a propósito, sobre todo con iTunes, que pide no pasar
de unas 20 por minuto.
"""

import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

BASE = Path(__file__).resolve().parent
CARPETA_AUDIO    = BASE / "audio"
CARPETA_LETRAS   = BASE / "letras"
CARPETA_PORTADAS = BASE / "portadas"

EXT_AUDIO   = (".mp3", ".m4a", ".ogg", ".opus", ".wav", ".flac", ".aac")
EXT_PORTADA = (".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif")
FECHA_RE    = re.compile(r"^(\d{4}-\d{2}-\d{2})")

LRCLIB = "https://lrclib.net/api"
ITUNES = "https://itunes.apple.com/search"
AGENTE = "calendario-un-anio-de-canciones/1.0 (uso personal)"

MARGEN_AVISO   = 4.0    # segundos de desfase a partir de los cuales avisamos
ESPERA_LRCLIB  = 0.35
ESPERA_ITUNES  = 3.1    # iTunes pide no pasar de ~20 peticiones por minuto
TAMANO_DEFECTO = 600


# ---------------------------------------------------------------- red

def traer_json(url, parametros):
    """Devuelve el JSON, o None si no hay resultado (404)."""
    entero = url + "?" + urllib.parse.urlencode(parametros)
    peticion = urllib.request.Request(entero, headers={"User-Agent": AGENTE})
    try:
        with urllib.request.urlopen(peticion, timeout=25) as r:
            cuerpo = r.read().decode("utf-8", "replace")
        return json.loads(cuerpo) if cuerpo.strip() else None
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def traer_bytes(url):
    peticion = urllib.request.Request(url, headers={"User-Agent": AGENTE})
    with urllib.request.urlopen(peticion, timeout=40) as r:
        return r.read()


# ---------------------------------------------------------------- archivos

def fecha_de(ruta):
    m = FECHA_RE.match(ruta.stem)
    if not m:
        return None
    try:
        date(*[int(x) for x in m.group(1).split("-")])
    except ValueError:
        return None
    return m.group(1)


def partes_del_nombre(ruta, clave):
    """'2026-09-21 - Radiohead - Creep' -> ('Radiohead', 'Creep')"""
    resto = ruta.stem[len(clave):].strip(" -_")
    if not resto:
        return "", ""
    trozos = [t.strip() for t in resto.split(" - ") if t.strip()]
    if len(trozos) >= 2:
        return trozos[0], " - ".join(trozos[1:])
    return "", trozos[0]


def datos_del_archivo(ruta):
    """(artista, titulo, duracion, portada_incrustada) leídos del propio mp3."""
    try:
        import mutagen
    except ImportError:
        return "", "", None, None
    try:
        f = mutagen.File(ruta)
        if f is None:
            return "", "", None, None
        etiquetas = getattr(f, "tags", None) or {}

        def primero(*claves):
            for k in claves:
                v = etiquetas.get(k)
                if v:
                    if isinstance(v, list):
                        v = v[0]
                    return str(v).strip()
            return ""

        duracion = None
        info = getattr(f, "info", None)
        if info is not None and getattr(info, "length", None):
            duracion = float(info.length)

        portada = None
        try:
            for k in getattr(etiquetas, "keys", lambda: [])():
                if str(k).startswith("APIC"):
                    portada = etiquetas[k].data
                    break
            if portada is None and getattr(f, "pictures", None):
                portada = f.pictures[0].data
            if portada is None and "covr" in etiquetas:
                portada = bytes(etiquetas["covr"][0])
        except Exception:
            portada = None

        return (primero("TPE1", "artist", "\xa9ART"),
                primero("TIT2", "title", "\xa9nam"),
                duracion, portada)
    except Exception:
        return "", "", None, None


def normalizar(texto):
    """'ROSALÍA' y 'Rosalia' pasan a ser lo mismo, para poder compararlos."""
    plano = unicodedata.normalize("NFKD", str(texto or "").lower())
    plano = "".join(c for c in plano if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", plano).strip()


def parecido_de_artista(encontrado, pedido):
    """0 = es el mismo, 1 = se parece o no sabemos, 2 = es otro. Menor es mejor."""
    a, p = normalizar(encontrado), normalizar(pedido)
    if not p:
        return 1
    if a == p:
        return 0
    if a and (p in a or a in p):
        return 1
    return 2


MARCAS_DE_VERSION = (
    "live", "en vivo", "en directo", "acoustic", "acustic", "unplugged",
    "remix", "rmx", "radio edit", "edit", "karaoke", "cover", "instrumental",
    "demo", "reprise", "mix", "session", "rehearsal", "orchestral", "piano",
)

def penalizacion_de_version(titulo):
    """
    0 = título limpio ("Creep")
    1 = lleva algo entre paréntesis ("Malamente (Cap.1: Augurio)")
    2 = es claramente otra versión ("Creep (Acoustic)", "... (Live at ...)")

    Sirve de desempate cuando dos resultados duran casi lo mismo: entre
    la del disco y una en directo de la misma longitud, gana la del disco.
    """
    t = normalizar(titulo)
    entre_parentesis = re.findall(r"[\(\[]([^\)\]]*)[\)\]]", str(titulo or ""))
    if any(m in normalizar(trozo) for trozo in entre_parentesis for m in MARCAS_DE_VERSION):
        return 2
    if any(re.search(r"\b" + re.escape(m) + r"\b", t) for m in MARCAS_DE_VERSION):
        return 2
    return 1 if entre_parentesis else 0


def extension_de_imagen(datos):
    if datos[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if datos[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if datos[:4] == b"RIFF" and datos[8:12] == b"WEBP":
        return ".webp"
    return None


# ---------------------------------------------------------------- letras

def puntuar_letra(candidato, artista, duracion):
    tiene_sync = bool(candidato.get("syncedLyrics"))
    dur = candidato.get("duration") or 0
    desvio = abs(dur - duracion) if (duracion and dur) else 0
    return (parecido_de_artista(candidato.get("artistName"), artista),
            0 if tiene_sync else 1,
            round(desvio / 3.0) if duracion else 0,
            penalizacion_de_version(candidato.get("trackName")),
            desvio)


def buscar_letra(artista, titulo, duracion):
    """Devuelve (candidato, cómo_lo_encontró) o (None, motivo)."""
    if artista and titulo:
        p = {"artist_name": artista, "track_name": titulo}
        if duracion:
            p["duration"] = int(round(duracion))
        d = traer_json(LRCLIB + "/get", p)
        if d:
            return d, "exacta"
        if duracion:
            d = traer_json(LRCLIB + "/get", {"artist_name": artista, "track_name": titulo})
            if d:
                return d, "exacta (otra duración)"

    consulta = (artista + " " + titulo).strip()
    if not consulta:
        return None, "sin artista ni título"
    resultados = traer_json(LRCLIB + "/search", {"q": consulta})
    if not resultados:
        return None, "sin resultados"
    resultados.sort(key=lambda c: puntuar_letra(c, artista, duracion))
    return resultados[0], "búsqueda (%d candidatas)" % len(resultados)


# ---------------------------------------------------------------- carátulas

def buscar_caratula(artista, titulo, duracion, tamano):
    """
    Devuelve (bytes, descripción) o (None, motivo).
    Elige por duración: el primer resultado suele ser una versión alternativa.
    """
    consulta = (artista + " " + titulo).strip()
    if not consulta:
        return None, "sin artista ni título"

    d = traer_json(ITUNES, {"term": consulta, "entity": "song",
                            "limit": 25, "media": "music"})
    if not d or not d.get("results"):
        return None, "sin resultados"

    candidatas = [r for r in d["results"] if r.get("artworkUrl100")]
    if not candidatas:
        return None, "sin carátula"

    # Orden de importancia:
    #   1. que sea el mismo artista  (si no, sale una banda de tributo)
    #   2. que dure aproximadamente lo mismo, en tramos de 3 segundos
    #   3. dentro de ese tramo, que el título sea el limpio y no un directo
    #   4. y ya como último desempate, la diferencia exacta de segundos
    def puntuar(r):
        seg = (r.get("trackTimeMillis") or 0) / 1000.0
        desvio = abs(seg - duracion) if (duracion and seg) else 0
        tramo = round(desvio / 3.0) if duracion else 0
        return (parecido_de_artista(r.get("artistName"), artista),
                tramo,
                penalizacion_de_version(r.get("trackName")),
                desvio)

    candidatas.sort(key=puntuar)
    elegida = candidatas[0]
    otro_artista = parecido_de_artista(elegida.get("artistName"), artista) == 2

    url = elegida["artworkUrl100"].replace("100x100bb", "%dx%dbb" % (tamano, tamano))
    try:
        datos = traer_bytes(url)
    except Exception:
        datos = traer_bytes(elegida["artworkUrl100"])

    if not extension_de_imagen(datos):
        return None, "la descarga no es una imagen"

    album = elegida.get("collectionName") or elegida.get("trackName") or ""
    ms = elegida.get("trackTimeMillis")
    detalle = album[:36]
    if otro_artista:
        detalle += ", pero es de %s" % (elegida.get("artistName") or "otro artista")[:24]
    elif ms and duracion:
        desfase = abs(ms / 1000.0 - duracion)
        if desfase > MARGEN_AVISO:
            detalle += ", %ds de diferencia" % round(desfase)
    return datos, detalle


# ---------------------------------------------------------------- programa

def main(argv):
    forzar = "--forzar" in argv
    hacer_letras = "--solo-caratulas" not in argv
    hacer_portadas = "--solo-letras" not in argv

    tamano = TAMANO_DEFECTO
    if "--tamano" in argv:
        try:
            tamano = max(100, min(2000, int(argv[argv.index("--tamano") + 1])))
        except (IndexError, ValueError):
            print("--tamano necesita un número entre 100 y 2000. Uso %d." % tamano)

    if not CARPETA_AUDIO.is_dir():
        print("No encuentro la carpeta audio/. Ejecútame dentro de la carpeta del regalo.")
        return 1
    CARPETA_LETRAS.mkdir(exist_ok=True)
    CARPETA_PORTADAS.mkdir(exist_ok=True)

    canciones = {}
    for ruta in sorted(CARPETA_AUDIO.iterdir()):
        if ruta.is_file() and ruta.suffix.lower() in EXT_AUDIO:
            clave = fecha_de(ruta)
            if clave:
                canciones.setdefault(clave, ruta)

    if not canciones:
        print("No hay ningún audio con nombre de fecha en audio/.")
        print("Ejemplo:  audio/2026-09-21 - Radiohead - Creep.mp3")
        return 1

    try:
        import mutagen  # noqa: F401
    except ImportError:
        print("Aviso: no tienes `mutagen`, así que no puedo medir tus archivos")
        print("       y acertaré menos con la versión correcta. Instálalo con:")
        print("           py -m pip install --user mutagen")
        print()

    que = " y ".join([x for x in (["letras"] if hacer_letras else []) +
                                (["carátulas"] if hacer_portadas else [])])
    print("Buscando %s para %d canción(es).\n" % (que, len(canciones)))

    n_sync = n_plana = n_portada = n_incrustada = 0
    bytes_portadas = 0
    pendientes = []
    primera_itunes = True

    for clave, ruta in sorted(canciones.items()):
        artista, titulo = partes_del_nombre(ruta, clave)
        a2, t2, duracion, incrustada = datos_del_archivo(ruta)
        artista = artista or a2
        titulo = titulo or t2

        etiqueta = "%s  %s" % (clave, (artista + " - " + titulo).strip(" -") or ruta.name)

        if not titulo:
            print("  --  " + etiqueta)
            pendientes.append("%s  no sé qué canción es: renombra el archivo como "
                              "'%s - Artista - Titulo.mp3'" % (clave, clave))
            continue

        lineas_estado = []

        # ---------------- letra ----------------
        if hacer_letras:
            ya = (CARPETA_LETRAS / (clave + ".lrc")).exists() or \
                 (CARPETA_LETRAS / (clave + ".txt")).exists()
            if ya and not forzar:
                lineas_estado.append(("--", "letra: ya la tenías"))
            else:
                try:
                    elegida, como = buscar_letra(artista, titulo, duracion)
                except Exception as e:
                    elegida, como = None, "fallo de red: %s" % e
                time.sleep(ESPERA_LRCLIB)

                if not elegida:
                    lineas_estado.append(("--", "letra: %s" % como))
                    pendientes.append("%s  letra no encontrada (%s). Escríbela a mano en "
                                      "letras/%s.txt" % (clave, como, clave))
                elif elegida.get("instrumental"):
                    lineas_estado.append(("~~", "letra: es instrumental"))
                else:
                    sync = (elegida.get("syncedLyrics") or "").strip()
                    plana = (elegida.get("plainLyrics") or "").strip()
                    dur = elegida.get("duration") or 0
                    desfase = abs(dur - duracion) if (duracion and dur) else None
                    if sync:
                        (CARPETA_LETRAS / (clave + ".lrc")).write_text(sync + "\n", encoding="utf-8")
                        n_sync += 1
                        det = "letra: %d versos" % len(sync.splitlines())
                        marca = "ok"
                        if desfase is not None and desfase > MARGEN_AVISO:
                            marca = "??"
                            det += ", de una versión de %ds (la tuya dura %ds)" % (
                                round(dur), round(duracion))
                            pendientes.append("%s  la letra puede ir desincronizada: %ds de "
                                              "diferencia" % (clave, round(desfase)))
                        lineas_estado.append((marca, det))
                    elif plana:
                        (CARPETA_LETRAS / (clave + ".txt")).write_text(plana + "\n", encoding="utf-8")
                        n_plana += 1
                        lineas_estado.append(("~~", "letra: solo sin sincronizar"))
                    else:
                        lineas_estado.append(("--", "letra: encontrada pero vacía"))

        # ---------------- carátula ----------------
        if hacer_portadas:
            ya = any((CARPETA_PORTADAS / (clave + e)).exists() for e in EXT_PORTADA)
            if ya and not forzar:
                lineas_estado.append(("--", "carátula: ya la tenías"))
            elif incrustada and extension_de_imagen(incrustada):
                ext = extension_de_imagen(incrustada)
                (CARPETA_PORTADAS / (clave + ext)).write_bytes(incrustada)
                n_incrustada += 1
                bytes_portadas += len(incrustada)
                lineas_estado.append(("ok", "carátula: sacada del propio mp3"))
            else:
                if not primera_itunes:
                    time.sleep(ESPERA_ITUNES)
                primera_itunes = False
                try:
                    datos, det = buscar_caratula(artista, titulo, duracion, tamano)
                except Exception as e:
                    datos, det = None, "fallo de red: %s" % e

                if datos:
                    ext = extension_de_imagen(datos) or ".jpg"
                    (CARPETA_PORTADAS / (clave + ext)).write_bytes(datos)
                    n_portada += 1
                    bytes_portadas += len(datos)
                    dudosa = ("diferencia" in det) or ("pero es de" in det)
                    lineas_estado.append(("??" if dudosa else "ok", "carátula: %s" % det))
                    if "pero es de" in det:
                        pendientes.append("%s  la carátula es de otro artista. Compruébala, y si "
                                          "no vale, pon una a mano en portadas/%s.jpg"
                                          % (clave, clave))
                else:
                    lineas_estado.append(("--", "carátula: %s" % det))
                    pendientes.append("%s  sin carátula (%s). Puedes poner una a mano en "
                                      "portadas/%s.jpg" % (clave, det, clave))

        peor = "ok"
        for marca, _ in lineas_estado:
            if marca == "--":
                peor = "--"
            elif marca == "??" and peor != "--":
                peor = "??"
            elif marca == "~~" and peor == "ok":
                peor = "~~"
        print("  %-4s%s" % (peor, etiqueta))
        for marca, det in lineas_estado:
            print("        %s %s" % (marca, det))

    print()
    if hacer_letras:
        print("   letras sincronizadas .... %d" % n_sync)
        if n_plana:
            print("   letras sin sincronizar .. %d" % n_plana)
    if hacer_portadas:
        print("   carátulas de iTunes ..... %d" % n_portada)
        if n_incrustada:
            print("   carátulas del propio mp3  %d" % n_incrustada)
        if bytes_portadas:
            print("   ocupan .................. %.1f MB" % (bytes_portadas / 1048576.0))

    if pendientes:
        print()
        print("Pendientes:")
        for p in pendientes:
            print("   - " + p)

    print()
    print("Ahora ejecuta ACTUALIZAR.bat para meterlo todo en el calendario.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
