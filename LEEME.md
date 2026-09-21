# regalos

Páginas-regalo publicadas con GitHub Pages: **https://master4326.github.io/regalos/**

| archivo | qué es | en vivo |
|---|---|---|
| `index.html` | portada con los enlaces | `/regalos/` |
| `pa-tu-amarillo.html` | la lámina índigo con lirios amarillos | `/regalos/pa-tu-amarillo.html` |
| `pa-tu.html` | la lámina original, papel crema | `/regalos/pa-tu.html` |
| `consola-del-corazon.html` | la consola retro | `/regalos/consola-del-corazon.html` |

Cada página es un HTML suelto y autónomo (solo carga fuentes de Google), así que
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
