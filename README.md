# Pueblo Vivo

Un pueblo español en miniatura que vive solo en la pantalla de un Echo Show. Tú eres su santo patrón.

## Qué hay en esta carpeta

| Carpeta | Qué es |
| --- | --- |
| `docs/` | La web del juego (HTML5 + Canvas). GitHub Pages la sirve desde aquí. |
| `docs/sim.js` | El motor de la simulación. Lo usan la web y la skill. |
| `lambda/` | El código de la skill de Alexa (Node.js). |
| `skill-package/` | Manifiesto de la skill y modelo de voz en español (es-ES). |
| `sync-sim.sh` | Copia `docs/sim.js` a `lambda/sim.js` tras cambiar el motor (en Windows: `Copy-Item docs\sim.js lambda\sim.js`). |

## Fase 1

- Mapa en rejilla de 8×8 píxeles con calles, plaza, calle de abajo y huerta. Los vecinos buscan ruta (A*) y no atraviesan casas, árboles, bancos ni la fuente.
- 21 vecinos con dinero: pan cada mañana, cañas en el bar, mercado los sábados, sueldos, facturas los lunes, pensiones.
- Historias: préstamos y deudas, flechazos, declaraciones, celos, rupturas, bodas, broncas en el mus, sequía, reformas de casas y un suceso pequeño casi cada día.
- Sexto poder: «que toque la lotería». Cada vecino reacciona según su carácter.
- Preguntar por un vecino: «Alexa, ¿cómo está Paco?».
- La skill descarga el motor (`sim.js`) de la web publicada, así que los cambios del juego no obligan a tocar la consola de Alexa. Si la web no responde, usa la copia local `lambda/sim.js`.

## Fase 1.5: el pueblo crece

- **Fama y niveles.** Cada noche el pueblo gana fama según el ánimo de los vecinos, la cosecha, la gente y las casas arregladas; las bodas, los forasteros y las inauguraciones suman más. Hay cinco niveles: Aldea, Pueblo (fama 60), Pueblo con encanto (200), Villa (450) y Villa próspera (900). Al subir hay cartel, fuegos artificiales, verbena al día siguiente y llega gente nueva.
- **Obras.** Cada nivel desbloquea obras que se ven construir: farolas y tienda (nivel 2), escuela y olivar (3), quiosco y molino (4), plaza nueva con naranjos y estatua (5). Los solares tienen cartel desde el principio; durante la obra hay andamios y vecinos echando una mano.
- **Vida nueva.** Los niños van a la escuela, Carmen atiende la tienda, se compra el periódico en el quiosco y las casas pueden llegar a tener balcón con geranios.
- **Libro del pueblo** (panel de arriba a la derecha o botón 📖): nivel y obras, hitos, crónica y vecinos. Al decir «Alexa, ¿qué ha pasado?» se abre en la crónica.
- **Aspecto.** Pantalla completa sin franjas, vecinos con más detalle (sombrero de paja, gorro de panadero, bastón…), amanecer y atardecer, estaciones según el calendario real, nieve y Navidad, nubes, charcos, humo de chimeneas, pájaros y bocadillos que no se pisan.
- Las partidas guardadas antes siguen valiendo, y la skill no necesita cambios: descarga el motor nuevo de la web.

## Ciclo de vida

- **Familias con apellido.** Cada vecino pertenece a una familia (los García, los Moreno…). Los hijos heredan el apellido y el libro tiene una pestaña de Familias con su dinero, sus negocios y sus difuntos.
- **Nacimientos.** Las parejas casadas y contentas esperan un bebé (se anuncia unos días antes) y las parejas del mismo sexo pueden adoptar. Los bebés heredan rasgos y aspecto de sus padres.
- **Vejez y muerte.** Un año de juego dura una semana. A los 67 años los vecinos se jubilan, y a partir de los 72 pueden fallecer. Hay entierro en la iglesia con el pueblo de luto, tumba en el cementerio, viudos y herencias de dinero y negocios. Si muere el cura, llega uno nuevo.
- **Éxodo rural.** Los jóvenes solteros que no están a gusto pueden irse a la ciudad; cuanto más próspero el pueblo, menos se van.
- «Alexa, ¿cómo está Remedios?» responde aunque ya haya fallecido.

## Fase 2, paso 1: mapa nuevo

- **Pueblo orgánico de 96 × 60 casillas** (antes 60 × 34): calles curvas con nombre (Calle Mayor, Calle de la Iglesia, Callejón del Pozo, Calle del Molino, Calle Real, Calle del Río, Calle Nueva), plaza mayor con soportales, carretera asfaltada, río con puente y álamos, eras y molino en el alto.
- **Casas entre medianeras** generadas a lo largo de las calles, con su corral o huerto detrás y dirección postal («Calle Mayor, 3»). Cada casa tiene un tope de 3 a 6 vecinos según su tamaño.
- **El pueblo crece solo:** si un matrimonio no tiene casa propia o una casa se llena, primero buscan una vacía y, si no la hay, se construye una nueva en un solar de las afueras (2 días de obra, con andamios y vecinos ayudando).
- **Edificios con función:** ayuntamiento (allí se empadronan los que llegan y se hacen papeles los lunes), consultorio (llega una médica; los mayores van a revisión y viven más) y cuartel de la Guardia Civil (llega un guardia que patrulla; hay menos broncas). Cada edificio se reconoce por su forma, y al tocarlo sale su ficha con quién hay dentro.
- **Cámara:** se arrastra con el dedo, se acerca y aleja con los botones ＋/－ o pellizcando, y ⌂ vuelve a la plaza. Si nadie toca la pantalla durante 20 segundos, la cámara va sola hacia lo último que ha pasado.
- Los pueblos guardados con el mapa viejo se mudan solos al nuevo: conservan vecinos, casas (h0…h11), obras, familias e hitos.

## Fase 2, paso 2: fe y dilemas del santo

- **Fe (0–100).** Cada poder cuesta fe: sol 8, lluvia 10, fiesta 15, forastero 20, bendecir 25, lotería 35. Sube cada día con los vecinos contentos y devotos, y además con las misas, los entierros, las bodas y cada dilema que contestas. Se ve en el panel del pueblo, y cada botón muestra su coste (en gris si no llega).
- **Milagros y castigos** (botón 😇): lluvia de estrellas (30, esa noche hay estrellas fugaces y nacen amores), aparición del santo (60, una luz dorada sobre la fuente, todo el pueblo contento y más fama) y plaga de langostas (castigo: arrasa la cosecha pero da +15 de fe porque la iglesia se llena).
- **Dilemas.** Casi cada mañana a las 10 el pueblo te pide decidir entre dos salidas: iglesia o puente, perdonar un robo o multarlo, orquesta o ahorro, acoger temporeros, una linde en disputa, animar una declaración, una colecta para un negocio en apuros, procesión o pozo en la sequía, un joven que se quiere ir, paellas o vaquilla, campanas al alba. Tienes 13 horas de juego; si no contestas, decide el pueblo. La consecuencia se ve al día siguiente.
- Por ahora los dilemas se contestan tocando la pantalla; la voz llegará con el paso 3. Si pides un poder por voz sin fe suficiente, Alexa te lo dice.

## Fase 2, paso 3: alcalde y elecciones

- **Alcalde y bandos.** Cada vecino tira hacia **la tradición** (devotos, ahorradores, gruñones, mayores) o hacia **el progreso** (juerguistas, alegres, románticos, jóvenes). Al empezar, el vecino con más prestigio hace de alcalde, y entre semana despacha en el ayuntamiento por la mañana.
- **Lo que cambia según quién mande.** Con la tradición la contribución es de 4 € a la semana, hay más fe cada día y las obras empiezan por la plaza, el olivar y el molino. Con el progreso la contribución es de 10 €, el pueblo gana más fama, las obras van un 30 % más rápido si hay dinero en las arcas y empiezan por la escuela, el consultorio y la tienda.
- **Elecciones cada 14 días.** Tres días antes empieza la campaña: un candidato por bando, con mítines en la plaza por la tarde. El día de las elecciones los vecinos van a votar al ayuntamiento, y a las 20:00 se cuentan los votos (cuentan la amistad con cada candidato, el bando de cada uno, si el pueblo está contento con el alcalde y la bendición del santo). Hay cartel de resultados y verbena.
- **Bendecir a un candidato** cuesta 20 de fe y le da votos, sobre todo entre los devotos.
- Si el alcalde muere o se va, hay elecciones a los tres días.

### Voz nueva (pasos 2 y 3)

- «Alexa, la primera» / «Alexa, la segunda» contesta el dilema del día; «Alexa, ¿qué me pide el pueblo?» lo lee. En el Echo Show, Alexa lee el dilema en cuanto aparece.
- «Alexa, lluvia de estrellas», «Alexa, aparécete», «Alexa, plaga de langostas».
- «Alexa, ¿quién es el alcalde?», «Alexa, ¿cuándo son las elecciones?», «Alexa, apoya a Carmen».
- Todo funciona también en un Echo sin pantalla.

## Fase 2, paso 4: economía viva

- **Cadenas de producción.** Los agricultores sacan trigo según la cosecha; con el molino restaurado se hace harina y el pan de la panadería sale con harina del pueblo (si no, el panadero la compra fuera y gana menos). El olivar da aceituna y el viñedo nuevo (obra de nivel 3, al otro lado del río) da uva; hace falta que algún vecino monte una almazara o una bodega para convertirlas en aceite y vino.
- **Negocios que nacen y quiebran.** Cada pocos días, un vecino con ahorros y carácter emprendedor puede abrir un negocio en su casa (se ve su toldo y su cartel): almazara, bodega, granja de cabras, casa rural, peluquería o taberna. La taberna le quita clientela al bar. Los negocios contratan a vecinos, pagan sueldos, despiden cuando van mal y, si no salen las cuentas, quiebran. Los hereda la familia.
- **Arcas del ayuntamiento.** Pagan las obras (si no hay dinero, van lentas) y se llenan con la contribución y con lo que sobra de harina, trigo, aceituna y uva, que se vende fuera. Cuando sobran más de 600 €, el alcalde las gasta: la tradición paga fiestas con orquesta; el progreso, mejoras que dan fama. Con el progreso, quien abre un negocio recibe 150 € de ayuda.
- **Libro → Economía:** las cadenas de producción, los negocios con su estado y sus empleados, y los precios de los negocios de siempre.

## Probarlo en el ordenador

Abre `docs/index.html` en el navegador. Funciona sin Alexa: los poderes están en los botones de abajo a la derecha.

- `?speed=20` acelera el tiempo (un día de juego por minuto).
- `?nuevo=1` empieza un pueblo nuevo.
- Toca a un vecino para ver su ficha.

Modo prueba (no guarda nada): `?demo=12` crea un pueblo con 12 días vividos, `&hora=21` salta a esa hora, `&estacion=invierno`, `&navidad=1`, `&tiempo=lluvia`, `&libro=hitos` abre el libro, `&vecino=paco` abre su ficha, `&zoom=0.1` muestra el pueblo entero y `&cam=20,12` centra la cámara en esa casilla.

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

- [ ] La skill abre el pueblo en el Echo Show **sin Alexa+**.
- [ ] La skill abre el pueblo en el Echo Show **con Alexa+**.
- [ ] Cuánto tiempo sigue abierta la pantalla sin hablarle (se pide el máximo, 30 minutos).
- [ ] Los poderes por voz funcionan con la web abierta.
- [ ] Al volver al día siguiente, Alexa narra la crónica.
- [ ] En un Echo sin pantalla se oye la crónica y funcionan los poderes.
- [ ] La animación va fluida en el Echo Show que tengas (sobre todo en un Show 5).
