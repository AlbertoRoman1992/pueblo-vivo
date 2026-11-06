# Pueblo Vivo — prueba técnica (fase 0)

Un pueblo español en miniatura que vive solo en la pantalla de un Echo Show. Tú eres su santo patrón.

## Qué hay en esta carpeta

| Carpeta | Qué es |
| --- | --- |
| `docs/` | La web del juego (HTML5 + Canvas). GitHub Pages la sirve desde aquí. |
| `docs/sim.js` | El motor de la simulación. Lo usan la web y la skill. |
| `lambda/` | El código de la skill de Alexa (Node.js). |
| `skill-package/` | Manifiesto de la skill y modelo de voz en español (es-ES). |
| `sync-sim.sh` | Copia `docs/sim.js` a `lambda/sim.js` tras cambiar el motor. |

## Probarlo en el ordenador

Abre `docs/index.html` en el navegador. Funciona sin Alexa: los poderes están en los botones de abajo a la derecha.

- `?speed=20` acelera el tiempo (un día de juego por minuto).
- `?nuevo=1` empieza un pueblo nuevo.
- Toca a un vecino para ver su ficha.

## Ponerlo en un Echo Show

1. **Publicar la web.** Sube este proyecto a un repositorio público de GitHub llamado `pueblo-vivo`. En *Settings → Pages*, elige la rama `main` y la carpeta `/docs`. La web quedará en `https://albertoroman1992.github.io/pueblo-vivo/`.
2. **Apuntar la skill a la web.** `lambda/config.js` ya apunta a esa dirección.
3. **Crear la skill.** En la [consola de Alexa](https://developer.amazon.com/alexa/console/ask), *Create Skill* → nombre «Pueblo Vivo», idioma Spanish (ES), tipo *Games* o *Custom*, alojamiento *Alexa-hosted (Node.js)*, y en plantilla elige *Import skill* con la dirección del repositorio.
4. **Compilar y probar.** En la pestaña *Build*, compila el modelo. En *Test*, activa *Development*. Tu Echo Show, si está en la misma cuenta de Amazon, ya tendrá la skill.
5. **Decir:** «Alexa, abre pueblo vivo». Luego «Alexa, que llueva», «Alexa, haz una fiesta», «Alexa, manda un forastero que se llame Lucía» o «Alexa, ¿qué ha pasado en el pueblo?».

## Qué comprobar en esta fase

- [ ] La skill abre el pueblo en el Echo Show **sin Alexa+**.
- [ ] La skill abre el pueblo en el Echo Show **con Alexa+**.
- [ ] Cuánto tiempo sigue abierta la pantalla sin hablarle (se pide el máximo, 30 minutos).
- [ ] Los poderes por voz funcionan con la web abierta.
- [ ] Al volver al día siguiente, Alexa narra la crónica.
- [ ] En un Echo sin pantalla se oye la crónica y funcionan los poderes.
- [ ] La animación va fluida en el Echo Show que tengas (sobre todo en un Show 5).
