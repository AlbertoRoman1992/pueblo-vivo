# Pueblo Vivo

Un pueblo español en miniatura que vive solo en la pantalla de un Echo Show. Tú eres su santo patrón.

## Qué hay en esta carpeta

| Carpeta | Qué es |
| --- | --- |
| `docs/` | La web del juego (HTML5 + Canvas). GitHub Pages la sirve desde aquí. |
| `docs/sim.js` | El motor de la simulación. Lo usan la web y la skill. |
| `lambda/` | El código de la skill de Alexa (Node.js). |
| `skill-package/` | Manifiesto de la skill y modelo de voz en español (es-ES). |
| `sync-sim.sh` | Copia `docs/sim.js` a `lambda/sim.js` tras cambiar el motor. |

## Fase 1

- Mapa en rejilla de 8×8 píxeles con calles, plaza, calle de abajo y huerta. Los vecinos buscan ruta (A*) y no atraviesan casas, árboles, bancos ni la fuente.
- 21 vecinos con dinero: pan cada mañana, cañas en el bar, mercado los sábados, sueldos, facturas los lunes, pensiones.
- Historias: préstamos y deudas, flechazos, declaraciones, celos, rupturas, bodas, broncas en el mus, sequía, reformas de casas y un suceso pequeño casi cada día.
- Sexto poder: «que toque la lotería». Cada vecino reacciona según su carácter.
- Preguntar por un vecino: «Alexa, ¿cómo está Paco?».
- La skill descarga el motor (`sim.js`) de la web publicada, así que los cambios del juego no obligan a tocar la consola de Alexa. Si la web no responde, usa la copia local `lambda/sim.js`.

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

## Actualizar la skill en la consola de Alexa

Solo hace falta cuando cambian `lambda/` o el modelo de voz:

1. *Code* → *Import Code* → sube el zip de la carpeta `lambda` → *Deploy*.
2. *Build* → *Interaction Model* → *JSON Editor* → arrastra `skill-package/interactionModels/custom/es-ES.json` → *Save* → *Build skill*.

## Qué se comprobó en la fase 0

- [x] La skill abre el pueblo en el Echo Show **sin Alexa+**.
- [x] La skill abre el pueblo en el Echo Show **con Alexa+**.
- [ ] Cuánto tiempo sigue abierta la pantalla sin hablarle (se pide el máximo, 30 minutos).
- [ ] Los poderes por voz funcionan con la web abierta.
- [ ] Al volver al día siguiente, Alexa narra la crónica.
- [ ] En un Echo sin pantalla se oye la crónica y funcionan los poderes.
- [ ] La animación va fluida en el Echo Show que tengas (sobre todo en un Show 5).
