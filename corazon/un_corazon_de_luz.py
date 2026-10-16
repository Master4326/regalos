import math
import random
import sys
import time
import tkinter
import turtle

ANCHO, ALTO = 960, 820
CICLO = 22.0
CX, CY = 0, 18
ESCALA = 17.0
PERIODO = 1.0
ANILLOS = [1 - 0.074 * i for i in range(13)]
LUCES_ORILLA = 112
SEPARACION = 0.72

FONDO = (8, 3, 12)
CIELO_ALTO = (30, 8, 36)
CIELO_BAJO = (24, 5, 22)
BLANCO = (255, 255, 255)
ROSA_LUZ = (255, 160, 200)
BLANCO_TIBIO = (255, 238, 244)
DORADO = (255, 214, 160)


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def tramo(t, a, b):
    return clamp((t - a) / (b - a))


def suave(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def salida(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def lerp(a, b, k):
    return a + (b - a) * k


def mezcla(c1, c2, k):
    return (lerp(c1[0], c2[0], k), lerp(c1[1], c2[1], k), lerp(c1[2], c2[2], k))


def hexa(c):
    return "#%02x%02x%02x" % tuple(int(clamp(v, 0, 255)) for v in c)


def luz(c, a):
    return hexa(mezcla(FONDO, c, clamp(a)))


def paleta(c, pasos=24):
    return [luz(c, i / pasos) for i in range(pasos + 1)]


def corazon_xy(t):
    x = 16 * math.sin(t) ** 3
    y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
    return x, y


FINOS = [corazon_xy(2 * math.pi * i / 3000) for i in range(3000)]
_ACUM = [0.0]
for _a, _b in zip(FINOS, FINOS[1:]):
    _ACUM.append(_ACUM[-1] + math.dist(_a, _b))
PERIMETRO = _ACUM[-1] + math.dist(FINOS[-1], FINOS[0])


def remuestrear(n, corrimiento=0.0):
    res, j = [], 0
    for k in range(n):
        objetivo = PERIMETRO * (k + corrimiento) / n
        while j + 1 < len(_ACUM) and _ACUM[j + 1] < objetivo:
            j += 1
        res.append(FINOS[j])
    return res


def mundo(u, e):
    return (CX + e * u[0], CY + e * (u[1] + 3))


def latido(lt):
    amp = tramo(lt, 6.5, 7.5) * (1 - tramo(lt, 15.4, 16.0))
    if amp <= 0:
        return 0.0
    u = ((lt - 6.5) % PERIODO) / PERIODO
    return amp * (0.06 * math.exp(-((u - 0.06) / 0.05) ** 2)
                  + 0.035 * math.exp(-((u - 0.3) / 0.06) ** 2))


class Pincel:
    def __init__(self, pantalla):
        cv = pantalla.getcanvas()
        self.cv = getattr(cv, "_canvas", cv)
        self.sx, self.sy = pantalla.xscale, pantalla.yscale
        self.k = pantalla.xscale
        self._crear = lambda *args: self.cv.tk.call(self.cv._w, "create", *args)

    def linea(self, pts, color, ancho):
        sx, sy = self.sx, -self.sy
        plano = [v for x, y in pts for v in (x * sx, y * sy)]
        self._crear("line", *plano, "-fill", color, "-width", max(1, ancho * self.k),
                    "-capstyle", "round", "-tags", "vida")

    def punto(self, p, diam, color):
        r = max(0.5, diam * self.k / 2)
        x, y = p[0] * self.sx, -p[1] * self.sy
        self._crear("oval", x - r, y - r, x + r, y + r, "-fill", color, "-outline", "", "-tags", "vida")

    def borrar(self):
        self.cv.delete("vida")


def tortuga_pinta_fondo(k):
    t = turtle.Turtle(visible=False)
    t.setundobuffer(None)
    t.speed(0)
    t.penup()

    def banda(y0, alto, color):
        t.fillcolor(color)
        t.goto(-700, y0)
        t.begin_fill()
        for p in ((700, y0), (700, y0 - alto), (-700, y0 - alto)):
            t.goto(p)
        t.end_fill()

    for i in range(14):
        banda(ALTO / 2 + 40 - i * 15, 16, hexa(mezcla(CIELO_ALTO, FONDO, suave(i / 13))))
        banda(-ALTO / 2 + 10 + i * 12, 13, hexa(mezcla(CIELO_BAJO, FONDO, suave(i / 13))))
    for _ in range(110):
        c = random.choice((BLANCO, (255, 205, 225), (230, 205, 255)))
        t.goto(random.uniform(-500, 500), random.uniform(-420, 420))
        t.dot(max(1, random.choice((1, 1.5, 2)) * k), luz(c, random.uniform(0.12, 0.55)))


class Corazon:
    def __init__(self, pantalla, inicio=0.0):
        self.pantalla = pantalla
        tortuga_pinta_fondo(pantalla.xscale)
        self.p = Pincel(pantalla)
        ahora = time.perf_counter()
        self.t0 = ahora - inicio
        self.ultimo = ahora
        self.cuadros = 0
        self.luces = []
        puestos = []
        for r, f in enumerate(ANILLOS):
            n = max(1, round(LUCES_ORILLA * f))
            for u in remuestrear(n, 0.5 * (r % 2)):
                v = (u[0] * f, (u[1] + 3) * f - 3)
                if all(math.dist(v, w) >= SEPARACION for w in puestos):
                    puestos.append(v)
                    self.luces.append(self.nueva_luz(v, f))
        if all(math.dist((0, -3), w) >= SEPARACION for w in puestos):
            self.luces.append(self.nueva_luz((0, -3), 0.0))
        self.orilla = remuestrear(66)
        self.estrellas = [(random.uniform(-460, 460), random.uniform(-390, 400),
                           random.uniform(0, 6.3), random.uniform(1.5, 3.5),
                           random.uniform(1.8, 3.2)) for _ in range(26)]
        self.chispas = []
        self.acum_chispas = 0.0
        self.preparar_ciclo()

    def nueva_luz(self, u, f):
        sx, sy = self.lugar_al_azar()
        nx, ny = self.lugar_al_azar()
        col = DORADO if random.random() < 0.07 else mezcla(BLANCO_TIBIO, ROSA_LUZ, f ** 1.5)
        return {
            "u": u, "f": f, "sx": sx, "sy": sy, "nx": nx, "ny": ny,
            "fase": random.uniform(0, 6.3), "vel": random.uniform(1.5, 3.5),
            "retraso": (1 - f) * 1.3 + random.uniform(0, 0.6),
            "subida": random.uniform(0, 0.8),
            "giro": random.uniform(-0.4, 0.4),
            "tam": 4.2 + 1.4 * f + random.uniform(-0.3, 0.3),
            "pal": paleta(col),
            "halo": paleta(mezcla(col, ROSA_LUZ, 0.5)),
        }

    @staticmethod
    def lugar_al_azar():
        return random.uniform(-470, 470), random.uniform(-400, 400)

    def preparar_ciclo(self):
        self.ecos = []
        self.ultimo_latido = None

    def renacer(self, ahora):
        for q in self.luces:
            q["sx"], q["sy"] = q["nx"], q["ny"]
            q["nx"], q["ny"] = self.lugar_al_azar()
        self.t0 = ahora
        self.preparar_ciclo()

    def cuadro(self):
        try:
            inicio = time.perf_counter()
            self._cuadro()
            gasto = (time.perf_counter() - inicio) * 1000
            self.pantalla.ontimer(self.cuadro, max(1, int(28 - gasto)))
        except (turtle.Terminator, tkinter.TclError):
            pass

    def _cuadro(self):
        ahora = time.perf_counter()
        dt = min(0.05, ahora - self.ultimo)
        self.ultimo = ahora
        lt = ahora - self.t0
        if lt >= CICLO:
            self.renacer(ahora)
            lt = ahora - self.t0
        self.cuadros += 1
        self.p.borrar()

        e = ESCALA * (1 + latido(lt))
        self.estrellas_vivas(ahora)
        self.dibujar_ecos(lt)
        self.dibujar_luces(lt, ahora, e)
        self.mover_chispas(lt, e, dt, ahora)
        self.pantalla.update()

    def estrellas_vivas(self, ahora):
        for x, y, fase, vel, tam in self.estrellas:
            a = 0.5 + 0.5 * math.sin(ahora * vel + fase)
            self.p.punto((x, y), tam * (0.6 + 0.4 * a), luz((255, 230, 240), 0.1 + 0.6 * a))

    def flotando(self, x, y, q, ahora):
        return (x + 8 * math.sin(ahora * 0.6 + q["fase"]),
                y + 8 * math.cos(ahora * 0.45 + q["fase"] * 1.3))

    def pos_luz(self, q, lt, ahora, e):
        if lt < 16.3:
            k = suave(tramo(lt, 1.0 + q["retraso"], 3.6 + q["retraso"]))
            fx, fy = self.flotando(q["sx"], q["sy"], q, ahora)
            if k <= 0:
                return fx, fy, 0.0
            bx, by = mundo(q["u"], e)
            if k >= 1:
                return bx, by, 1.0
            dx, dy = bx - fx, by - fy
            s = math.sin(math.pi * k) * q["giro"]
            return fx + dx * k - dy * s, fy + dy * k + dx * s, k
        k = suave(tramo(lt, 16.3 + q["subida"], 19.8 + q["subida"]))
        bx, by = mundo(q["u"], e)
        nx, ny = self.flotando(q["nx"], q["ny"], q, ahora)
        cx, cy = CX + (bx - CX) * 1.35, by + 260
        return ((1 - k) ** 2 * bx + 2 * (1 - k) * k * cx + k * k * nx,
                (1 - k) ** 2 * by + 2 * (1 - k) * k * cy + k * k * ny, 1 - k)

    def dibujar_luces(self, lt, ahora, e):
        p = self.p
        en_latido = 7.0 < lt < 16.0
        u_lat = ((lt - 6.5) % PERIODO) / PERIODO
        barrido = None
        if 5.4 < lt < 16.0:
            fase_b = ((lt - 5.4) % 3.0) / 1.1
            if fase_b < 1:
                barrido = lerp(-34, 30, fase_b)
        for q in self.luces:
            x, y, armado = self.pos_luz(q, lt, ahora, e)
            brillo = 0.68 + 0.2 * math.sin(ahora * q["vel"] + q["fase"])
            extra = 0.0
            if armado >= 1:
                if en_latido:
                    d = u_lat - q["f"] * 0.38
                    extra += 0.6 * math.exp(-(d / 0.07) ** 2)
                if barrido is not None:
                    d = (q["u"][0] - q["u"][1]) * 0.75 - barrido
                    extra += 0.9 * math.exp(-(d / 3.0) ** 2)
            else:
                brillo = 0.45 + 0.3 * math.sin(ahora * q["vel"] + q["fase"]) + 0.25 * armado
                if 0 < armado < 1 and lt < 16.3:
                    ex, ey, _ = self.pos_luz(q, lt - 0.07, ahora - 0.07, e)
                    p.punto((ex, ey), q["tam"] * 0.7, q["pal"][9])
            tam = q["tam"] * (1 + 0.6 * extra)
            if extra > 0.3:
                p.punto((x, y), tam * 2.4, q["halo"][int(24 * min(0.32, 0.32 * extra))])
            p.punto((x, y), tam, q["pal"][int(24 * clamp(brillo + extra))])

    def dibujar_ecos(self, lt):
        if lt >= 6.5:
            n = int((lt - 6.5) // PERIODO)
            if 7.0 < lt < 15.4 and n != self.ultimo_latido:
                self.ultimo_latido = n
                self.ecos.append(lt)
        vivos = []
        for t0 in self.ecos:
            edad = lt - t0
            if not 0 <= edad < 1.8:
                continue
            vivos.append(t0)
            s = ESCALA * (1.03 + 0.55 * salida(edad / 1.8))
            color = luz(ROSA_LUZ, 0.7 * (1 - edad / 1.8))
            for u in self.orilla:
                self.p.punto(mundo(u, s), 3, color)
        self.ecos = vivos

    def mover_chispas(self, lt, e, dt, ahora):
        if 5.0 < lt < 16.0:
            self.acum_chispas += 9 * dt
            while self.acum_chispas >= 1:
                self.acum_chispas -= 1
                x, y = mundo(random.choice(self.orilla), e)
                dx, dy = x - CX, y - CY
                n = math.hypot(dx, dy) or 1
                v = random.uniform(15, 40)
                self.chispas.append({
                    "x": x, "y": y, "vx": dx / n * v, "vy": dy / n * v + 8,
                    "edad": 0.0, "vida": random.uniform(1.5, 2.8), "tam": random.uniform(2, 5),
                    "col": random.choice((BLANCO_TIBIO, ROSA_LUZ, DORADO)), "fase": random.uniform(0, 6.3),
                })
        vivas = []
        for s in self.chispas:
            s["edad"] += dt
            if s["edad"] >= s["vida"]:
                continue
            vivas.append(s)
            s["x"] += s["vx"] * dt
            s["y"] += s["vy"] * dt
            a = math.sin(math.pi * s["edad"] / s["vida"]) * (0.6 + 0.4 * math.sin(ahora * 12 + s["fase"]))
            pos, tam, col = (s["x"], s["y"]), s["tam"], s["col"]
            self.p.punto(pos, tam, luz(col, a))
            if tam > 3.8:
                l = tam * 2.2
                self.p.linea([(pos[0] - l, pos[1]), (pos[0] + l, pos[1])], luz(col, 0.6 * a), 1)
                self.p.linea([(pos[0], pos[1] - l), (pos[0], pos[1] + l)], luz(col, 0.6 * a), 1)
        self.chispas = vivas


def crear(inicio=0.0):
    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            pass
    pantalla = turtle.Screen()
    pantalla.title("Un corazón de luz")
    alto_pantalla = pantalla.getcanvas().winfo_screenheight()
    alto = min(1100, int(alto_pantalla * 0.88))
    ancho = int(alto * ANCHO / ALTO)
    pantalla.setup(ancho, alto)
    pantalla.setworldcoordinates(-ANCHO / 2, -ALTO / 2, ANCHO / 2, ALTO / 2)
    pantalla.bgcolor(hexa(FONDO))
    pantalla.tracer(0, 0)
    vida = Corazon(pantalla, inicio)
    pantalla.onkey(pantalla.bye, "Escape")
    pantalla.listen()
    vida.cuadro()
    return pantalla, vida


def main():
    crear()
    try:
        turtle.done()
    except (turtle.Terminator, tkinter.TclError):
        pass


if __name__ == "__main__":
    main()
