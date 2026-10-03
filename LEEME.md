# regalos

Páginas-regalo publicadas con GitHub Pages: **https://master4326.github.io/regalos/**

| archivo | qué es | en vivo |
|---|---|---|
| `index.html` | portada con los enlaces | `/regalos/` |
| `calendario/` | el calendario de un año de canciones | `/regalos/calendario/` |
| `luna/` | la luna en 3D entre estrellas, con fuegos artificiales, carta y farolitos | `/regalos/luna/` |
| `pa-tu-amarillo.html` | la lámina índigo con lirios amarillos | `/regalos/pa-tu-amarillo.html` |
| `pa-tu.html` | la lámina original, papel crema | `/regalos/pa-tu.html` |
| `consola-del-corazon.html` | la consola retro | `/regalos/consola-del-corazon.html` |
| `te-diria.html` | la carta "Te diría": sobre kraft, poema a máquina y notas a mano | `/regalos/te-diria.html` |

El calendario es la excepción: es una carpeta entera (`calendario/`), no un HTML
suelto. Ahí van los mp3, las portadas, las letras y las traducciones, y el enlace
de la portada apunta a la carpeta, no a un archivo.

La luna (`luna/`) también es carpeta: trae al lado de su `index.html` las dos
texturas de la luna (`moon-color.jpg`, el color, y `moon-height.jpg`, el relieve).
Usa three.js desde cdnjs. Ábrela desde el enlace: con doble clic el navegador no
deja usar las fotos y sale una luna de respaldo, más sencilla.

Cada una de las demás páginas es un HTML suelto y autónomo (solo carga fuentes de Google), así que
funciona igual abriéndola con doble clic que desde el enlace.

Los originales siguen en `Downloads\reproductor-extras` (`otros\` y la raíz);
esto son copias renombradas sin espacios, porque los espacios en una URL quedan feos.

## Agregar otro archivo (desde cualquier carpeta)

```powershell
cd C:\Users\olimp\Downloads\regalos
copy "C:\ruta\de\la\otra\carpeta\mi-pagina.html" .
git add .
git commit -m "agrego mi-pagina"
git push
```

Un par de minutos después queda en `https://master4326.github.io/regalos/mi-pagina.html`.
Si quieres que aparezca en la portada, agrégale un `<li>` a `index.html` copiando
uno de los que ya están.

Si la página trae carpetas propias (fotos, css, js), copia la carpeta entera al
lado del HTML y deja las rutas relativas como están.

## Actualizar el calendario

El original vive en `Downloads\borrador\prueba-con-musica` (la copia CON los mp3).
Después de tocar algo ahí y pasar `py actualizar.py`, se vuelve a copiar encima:

```powershell
robocopy C:\Users\olimp\Downloads\borrador\prueba-con-musica C:\Users\olimp\Downloads\regalos\calendario /MIR /XD __pycache__ /XF *.bak
cd C:\Users\olimp\Downloads\regalos
git add .
git commit -m "actualizo el calendario"
git push
```

Ojo: `/MIR` borra en destino lo que ya no esté en el origen, que es justo lo que
se quiere para que no se queden mp3 de un mes viejo.
