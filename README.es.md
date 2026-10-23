# TokenBinder

[English](README.md) · **Español**

Extensión de VS Code que mide los tokens que consumes en **GitHub Copilot Chat** mientras trabajas y los convierte en **sobres de cartas del Pokémon TCG**: abres sobres, coleccionas cartas de distintas rarezas (con efecto holográfico 3D) y las pones a entrenar para que evolucionen con tus tokens. En la barra de estado ves cuánto llevas gastado y qué **porcentaje de tu cupo mensual** representa.

Proyecto personal no oficial, sin relación con GitHub, Microsoft, Nintendo ni The Pokémon Company.

```
🔥 1.24M · 42%        ← barra de estado (amarilla desde 80 %, roja al 100 %)
```

## Qué hace

- **Contador en vivo** en la barra de estado: tokens usados en el periodo y % del cupo. Se actualiza en pocos segundos tras cada respuesta del chat.
- **Aviso de sobres**: junto al contador aparece `🎁 N` cuando tienes sobres o Pokébolas sin abrir; al pulsarlo se abre el panel.
- **Tooltip con desglose** de hoy, del mes y por modelo.
- **Panel lateral** (ícono de TokenBinder en la barra de actividad): sobres, carta en entrenamiento, álbum, cuota, gráfico por día y uso por modelo.
- **Alertas** al cruzar el 50 %, 80 % y 100 % del cupo.
- **Funciona con cualquier modelo** que tengas habilitado en Copilot (se cuenta por modelo) y con los modos de chat que uses.

## Si venías de PokeToken

TokenBinder es el nuevo nombre de **PokeToken** (la misma extensión, ahora centrada en cartas). Al instalar TokenBinder y abrir VS Code por primera vez se **migra solo** tu progreso (álbum, monedas, cartas en entrenamiento), tus ajustes `pokeToken.*` (que pasan a `tokenBinder.*`) y las imágenes ya descargadas, y se te ofrece desinstalar PokeToken para no tener dos extensiones iguales. Si no quieres conservar las cartas antiguas, usa `F1` → **TokenBinder: Reiniciar progreso**.

## Instalación

Requisitos: **Windows, macOS o Linux**, VS Code 1.90 o superior con el comando `code` en el PATH, y Copilot Chat. (El soporte de macOS y Linux llegó en la 1.2.0; hasta la 1.1 solo se leía la carpeta de datos de Windows.)

### Opción 1: un comando (recomendada)

En **Windows** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/SoreviR/token-binder/main/install.ps1 | iex
```

En **macOS / Linux** (Terminal):

```bash
curl -fsSL https://raw.githubusercontent.com/SoreviR/token-binder/main/install.sh | bash
```

Descarga el `.vsix` del último [Release](https://github.com/SoreviR/token-binder/releases/latest) y lo instala. Puedes leer los scripts antes de ejecutarlos: [`install.ps1`](install.ps1) e [`install.sh`](install.sh). En Mac, si dice que no encuentra `code`, abre VS Code y ejecuta `Cmd+Shift+P` → *Shell Command: Install 'code' command in PATH*; el script también prueba la ruta de `/Applications` por su cuenta.

### Opción 2: a mano

1. Descarga `token-binder-X.Y.Z.vsix` desde [Releases](https://github.com/SoreviR/token-binder/releases/latest).
2. En VS Code: `Ctrl+Shift+P` → **Extensions: Install from VSIX…** → elige el archivo. O por terminal:
   ```powershell
   code --install-extension token-binder-X.Y.Z.vsix
   ```

Después **reinicia VS Code**.

## Actualizar

VS Code no actualiza solo las extensiones instaladas desde un `.vsix`, así que TokenBinder lo hace por su cuenta:

- Una vez al día (unos segundos después de abrir VS Code) pregunta a GitHub si hay un [Release](https://github.com/SoreviR/token-binder/releases) más nuevo. Si lo hay, un aviso ofrece **Actualizar ahora**, **Ver novedades** y **Omitir esta versión**.
- *Actualizar ahora* descarga el `.vsix`, lo comprueba contra el tamaño y el SHA-256 que publica GitHub, lo instala y ofrece recargar VS Code. **Nunca instala nada sin que pulses el botón.**
- También puedes buscar a mano: `F1` → **TokenBinder: Buscar actualizaciones**.
- Para que no haga la consulta diaria, desactiva `tokenBinder.updates.check`. Sin ella, actualiza volviendo a ejecutar el instalador (Opción 1 o 2 de arriba).
- Tu progreso se conserva al actualizar. Antes del primer arranque de una versión nueva, la extensión guarda una copia de tu progreso en su carpeta de almacenamiento (`backups/` dentro del almacenamiento global de la extensión; se conservan las 3 últimas) y puedes restaurar una con **Importar progreso**.
- Si tienes la **1.4.0 o anterior** todavía no tienes el actualizador: ejecuta el instalador una vez más para conseguirlo. A partir de ahí las actualizaciones llegan solas.
- ¿Instalada desde el Marketplace (si algún día se publica ahí)? Entonces VS Code la actualiza y la comprobación propia no hace nada.

## Configuración

Esta extensión **no consulta a GitHub ni a tu organización**: calcula el porcentaje como *tu uso local ÷ el límite que tú configures*. Pregunta a tu administrador cuál es tu cupo.

**Forma rápida:** pulsa `F1`, escribe **TokenBinder: Configurar cupo mensual**, elige la unidad y escribe el número (acepta `5M`, `750k`, `5000000`). También puedes pasar el ratón sobre el contador de la barra de estado y pulsar *Configurar cupo*.

**Forma manual:** `F1` → **TokenBinder: Abrir ajustes** (o `Ctrl+,` y busca `tokenBinder`). Los ajustes disponibles:

| Ajuste | Por defecto | Descripción |
|---|---|---|
| `tokenBinder.language` | `auto` | Idioma de la interfaz: `auto` (sigue al de VS Code: español si es español, inglés en otro caso), `en` o `es`. Cambia en caliente, sin reiniciar. |
| `tokenBinder.updates.check` | `true` | Buscar en GitHub una vez al día si hay una versión nueva y ofrecer instalarla (nunca instala sin preguntar). |
| `tokenBinder.quota.monthlyLimit` | `5000000` | Tu cupo mensual, en la unidad elegida. **Cámbialo**: el valor por defecto es solo un marcador. |
| `tokenBinder.quota.unit` | `tokens` | `tokens` o `credits` (créditos de IA de Copilot). |
| `tokenBinder.quota.resetDay` | `1` | Día del mes (UTC) en que se reinicia el cupo. |
| `tokenBinder.alerts.thresholds` | `[50, 80, 100]` | Porcentajes que disparan un aviso. |
| `tokenBinder.packs.everyTokens` | `750000` | Cada cuántos tokens usados ganas un sobre. |
| `tokenBinder.growth.multiplier` | `1` | Escala los tokens que necesita cada carta para evolucionar (0.1–2). |
| `tokenBinder.sound.enabled` | `false` | Efectos de sonido cortos (abrir sobres, combates, metas), generados por el navegador: sin archivos de audio. Desactivado por defecto. |
| `tokenBinder.mishaps.enabled` | `false` | Percances por pasarte del 100 % de tu propia cuota mensual (mira [Pasarse de la cuota](#pasarse-de-la-cuota-percances)). Desactivado por defecto; las cartas en las que has invertido nunca se pierden. |
| `tokenBinder.online.enabled` | `false` | Activa las ligas online (mira [Ligas online](#ligas-online-opcional)). |
| `tokenBinder.online.server` | `https://token-binder-league.vercel.app` | Dirección del servidor de la liga (`https`). Solo la puedes cambiar tú, nunca un workspace. |
| `tokenBinder.storageRoots` | `[]` | Carpetas `User` de VS Code a leer, si usas una instalación no estándar. |

Los títulos de los comandos y las descripciones de los ajustes en la ventana de Ajustes de VS Code siguen el idioma de VS Code; todo lo demás (panel, álbum, avisos, diálogos) sigue a `tokenBinder.language`.

Comandos (`F1`): **TokenBinder: Abrir álbum**, **TokenBinder: Exportar progreso**, **TokenBinder: Importar progreso**, **TokenBinder: Reiniciar progreso**, **TokenBinder: Configurar cupo mensual**, **TokenBinder: Abrir ajustes**, **TokenBinder: Abrir panel** y **TokenBinder: Recalcular uso** y **TokenBinder: Buscar actualizaciones**.

## Cómo se juega

1. **Ganas sobres con tus tokens.** Empiezas con uno de bienvenida y recibes otro cada 750 K tokens usados (`packs.everyTokens`). Si llegas al **100 % del cupo** en un periodo, ganas un sobre extra de regalo.
2. **Abres el sobre** (botón *Abrir sobre*): salen 2 cartas reales del Pokémon TCG, **solo cartas de colección**. No hay comunes ni rarezas normales: cuanto más moderna es la era, más alta es la rareza mínima exigida.

   | Era | Series | Qué puede salir |
   |---|---|---|
   | **Vintage** | Base, Gym, Neo, Legendary Collection, e-Card | Solo holográficas (Base Set, Jungle, Fossil, Neo, Aquapolis, Skyridge…) |
   | **Clásica** | EX, Diamond & Pearl, Platinum, HeartGold SoulSilver, Call of Legends | Solo holográficas, incluidas LV.X, Prime y LEGEND, y Ultra Rare |
   | **Black & White / XY** | BW, XY | Ultra Rare (EX y full art) y Secret Rare |
   | **Moderna** | Sun & Moon, Sword & Shield | V, VMAX, VSTAR, Ultra, Secret, Radiant, Amazing, Shiny V… |
   | **Actual** | Scarlet & Violet y posteriores | Illustration rare, Special illustration rare, Hyper rare, Ultra y Secret |

   Cada carta de un sobre normal viene de una era según estas probabilidades aproximadas: Vintage 34 %, Clásica 28 %, BW/XY 16 %, Moderna 14 %, Actual 8 %. La **última carta** del sobre es la «estrella» y favorece las eras modernas (Moderna 26 %, Actual 20 %). El **sobre premium** trae 2 cartas de ese tipo, con la última aún más moderna, y la **Pokébola** es una sola carta de reparto normal.

   **Shadowless:** las cartas del Set Base pueden salir en su variante **Shadowless** (24 %) o **1.ª edición Shadowless** (6 %). Son ejemplares distintos en el álbum, con etiqueta y brillo dorado, y se venden más caras.
3. **Pon una carta a entrenar** (*Entrenar*, en el sobre o desde el álbum). Mientras usas tokens, su barra avanza y el panel estima cuántos días faltan según tu ritmo de los últimos 7 días. A los ~1.5 M tokens **evoluciona** a la carta siguiente de su línea (por ejemplo Charmander → Charmeleon → Charizard), prefiriendo cartas que cumplan el filtro de arriba y una rareza parecida; las siguientes etapas duran ~4.5 M, ~6 M y ~8 M tokens. Cuando ya no tiene más evoluciones **completa su línea**, te da **un sobre** (una sola vez por carta) y se queda en el hueco como **Maestra**, sin dejar de ganar nivel. `growth.multiplier` escala estas duraciones. Como en las eras antiguas muchas holográficas son ya la forma final, es normal que algunas cartas se gradúen sin evolucionar. Con *Retirar* liberas el hueco sin perder nada.
4. **Coleccionas** todo en el álbum. En el panel lateral ves un resumen y las 3 últimas cartas; el botón **Abrir álbum** (o `F1` → *TokenBinder: Abrir álbum*) lo abre en una pestaña grande del editor, con búsqueda por nombre, set o rareza, filtro por rareza y por era, orden (rareza, recientes, nombre, repetidas) y visor de carta en grande desde donde puedes entrenarla o **vender las copias repetidas**. Todo se puede usar con el teclado (Tab, Enter, Espacio, Esc).

Las cartas muestran una inclinación 3D que sigue al ratón, y las de rareza Holo o superior añaden brillo holográfico (las Ilustración y Secretas tienen efectos propios).

## Nivel, stats y valor de mercado

- **Nivel (1-50):** cada carta suma como XP los tokens que usas mientras está en un hueco de entrenamiento: un nivel cada 400 K tokens (unos 20 M para el 50). Al evolucionar, la carta nueva **hereda el nivel**; las Maestras (como Zapdos, que no evoluciona) siguen subiendo. Retirarla no le quita el nivel.
- **Stats (PS, ATQ, DEF, VEL):** salen de los datos reales de la carta (PS, daño de sus ataques, coste de retirada), normalizados por era para que una vintage y una VMAX sean comparables, y mejoran con el nivel, la etapa y la rareza. Son las que se usan en los combates. Las cartas que ya tenías se completan solas al abrir el álbum (hace falta conexión).
- **Valor de mercado:** el visor del álbum muestra un precio aproximado (tendencia de Cardmarket en € y precio de TCGplayer en $), una etiqueta de coleccionismo (*Común de mercado* → *Grail*) y el valor aproximado de toda tu colección. Se actualiza al mirar una carta si tiene más de 7 días. Es el precio de la carta normal (no distingue Shadowless) y es solo informativo: **no cambia** lo que te dan las monedas.

## Combates

Lleva **una carta** a combatir: ábrela en el álbum y pulsa **Llevar a combatir**, y abre la pestaña **Combate**. Te enfrentas uno tras otro a los ocho líderes de Kanto (Brock, Misty, Lt. Surge, Erika, Koga, Sabrina, Blaine, Giovanni), cada uno con una carta real. El combate es automático y dura unas 7 rondas; la pantalla muestra las probabilidades antes de empezar, lo reproduce con el nombre real de cada ataque y al final te explica **por qué ganaste o perdiste**.

**Qué hace fuerte a una carta.** Hay miles de cartas con PS y daños impresos muy distintos, así que lo impreso **no** decide el combate. La fuerza sale de factores pequeños y visibles, y la pestaña de combate te enseña el desglose de tu carta:

| Factor | Efecto |
|---|---|
| **Nivel de entrenamiento** (el que más pesa) | +1,8 % por nivel (nivel 50 = ×1,88) |
| **Demanda de mercado** (lo que vale de verdad la carta, *Común de mercado* → *Grail*) | +2 % por clase, hasta +10 % |
| **Rareza** (Holo, Ultra, Secreta…) | +0,3 % por categoría, hasta +1,8 % |
| **Etapa de evolución** | +2 % Fase 1, +4 % Fase 2 y ex/V/VMAX/Mega |
| **Grado** (cartas gradeadas) | +0,8 % por punto sobre 5, hasta +4 % |
| **Bonus por uso de tokens** | hasta +8 %: +2 % por cada 25 puntos de cupo mensual que hayas usado menos que un jugador típico (75 %) |

Lo que imprime la carta solo cambia *cómo* pelea: una con más PS que daño es más aguantadora, al revés pega más fuerte, con la misma potencia total. Una debilidad de tipo vale +15 % de daño (resistencia −8 %). El combate se tira con una semilla, así que es justo y reproducible.

**La escalera.** Vence a un líder para desbloquear al siguiente; la primera victoria da una **medalla** y monedas (150 → 1 000), las siguientes dan 3 monedas, con hasta 5 revanchas pagadas al día (un mes de uso normal da unas 500 monedas por tokens, así que combatir complementa la economía sin sustituirla). Los niveles de los líderes son 3, 9, 15 … 45, así que más o menos necesitas una carta de su nivel. Se guardan tu récord, tu racha y los últimos combates.

**Combatir también entrena.** La carta que pelea gana **10 000 de XP por victoria y 4 000 por derrota** (los 5 primeros combates de cada día, como mucho un octavo de nivel). No sustituye al entrenamiento por tokens: una carta sigue necesitando un hueco de entrenamiento para subir de nivel con regularidad.

### Jefe semanal y copa diaria

- **Jefe semanal:** la pestaña Combate muestra un jefe por semana (el mismo para todos; cada lunes llega uno nuevo) de nivel 40-50. Tienes **3 intentos a la semana** y la **primera victoria de la semana** da 🪙 400 y una caja misteriosa. Está pensado para una carta bien entrenada, y la pestaña te muestra primero tus probabilidades.
- **Copa diaria:** tres combates seguidos contra rivales algo más fuertes que tu carta, **una copa al día**. La entrada cuesta 🪙 30; ganar 2 rondas da 🪙 45 y ganar las 3 da 🪙 120 y una caja misteriosa. Es tanto un premio como un sumidero de monedas: de media cuesta algo más de lo que paga. Si no se pueden descargar las cartas de los rivales (sin conexión) no se cobra nada.
- Ambos cuentan en tu récord e historial como cualquier combate, y la carta que lucha gana XP de combate como siempre (dentro del límite diario).

### Equipos y Alto Mando

- **Equipo de tres:** tu carta de combate va delante y puedes añadir **dos cartas más** (arrástralas a la zona **Equipo** sobre el álbum, o usa el botón del visor de carta; arrastra una de vuelta a la cuadrícula para quitarla). Una carta mojada o en gradeo sale sola del equipo.
- **Alto Mando** (pestaña Combate, cuando tengas las **8 medallas de gimnasio**): Lorelei, Bruno, Agatha y Lance, en orden, cada uno con un equipo de tres cartas (niveles 34-48). El combate es una serie de duelos 1 contra 1: **el ganador conserva la vida que le queda** y el perdedor es sustituido por la siguiente carta, hasta que un equipo se queda sin nadie en pie. La primera victoria sobre cada entrenador da 🪙 1 200 a 2 500 y 1-3 cajas misteriosas; las revanchas dan 🪙 10, hasta 3 al día. Tu carta líder gana la XP de combate de siempre y las de apoyo la mitad. Las probabilidades que se muestran son las de todo el combate por equipos.

### Marcos de carta

Cuando ya lo has comprado todo, los **marcos de carta** (Oro, Neón, Llama, Escarcha, Arcoíris; 🪙 200-800) son una forma cosmética de gastar monedas. Están en la pestaña **Objetos** y solo cambian cómo se ven tus cartas en el álbum.

## Cajas misteriosas, objetos y evoluciones

Una **caja misteriosa** (120 monedas en la tienda) da un objeto al azar (caramelos, Huevo Suerte, objetos de combate, fundas, transformaciones raras; nunca piedras evolutivas), y tras 30 cajas seguidas sin una transformación la siguiente trae una. Una **caja de evolución** (50 monedas) da una piedra evolutiva: son más probables las de las líneas con ramas que ya tienes (Eevee…) y menos las que ya tienes en el inventario. Se abren desde el panel lateral o desde la pestaña **Objetos** del álbum, donde cada objeto que tienes aparece como una tarjeta que explica qué hace; una piedra que no necesites se puede **reciclar** ahí por 15 monedas.

| Objeto | Qué hace |
|---|---|
| Piedras Fuego / Agua / Trueno / Hoja / Hielo / Solar / Lunar / Día / Alba, Roca del Rey | Eligen una rama de una evolución ramificada (ver abajo) |
| Caramelo Raro | Sube una carta un nivel |
| Huevo Suerte | Una carta en entrenamiento gana **el doble de XP** (niveles) durante los próximos 1 M de tokens; se acumulan |
| Megapiedra, Banda Dynamax, Núcleo Astral, Orbe Teracristal (raros) | Transforman una carta terminada (ver abajo) |
| Placa Robusta, Cinta Elección, Garra Rápida, Amuleto de la Suerte | **Equipados en combate**, uno por carta (se equipan desde la carta en el álbum; no se gastan) |

**Los objetos equipados** cambian *cómo* pelea una carta sin hacerla más fuerte: la Placa Robusta (+10 % PS, −10 % ATQ) la hace más aguantadora, la Cinta Elección (+10 % ATQ, −10 % PS) un cañón de cristal, la Garra Rápida actúa antes con más frecuencia (+30 % de velocidad, −1 % de ATQ), y el Amuleto de la Suerte da muchos más golpes críticos (+20 %) pero más fallos (+9 %): un combate más impredecible que ayuda al menos fuerte y perjudica al favorito. Los tests mantienen cada uno en torno al 50 % contra la misma carta sin él.

**Evoluciones ramificadas.** Algunas líneas pueden evolucionar de varias formas: Eevee (8 especies), Gloom, Poliwhirl, Slowpoke, Kirlia, Snorunt, Cosmoem, Wurmple y Pikachu (Raichu o Raichu de Alola). Cuando la barra de entrenamiento se llena, la carta **espera** y el panel te pide elegir. Una especie ligada a un objeto (por ejemplo Umbreon necesita una Piedra Lunar, Flareon una Piedra Fuego, Gallade una Piedra Alba) solo está disponible si lo tienes, y el objeto se gasta. Las especies sin objeto se pueden elegir gratis, y **Dejar que evolucione sola** elige una rama al azar sin coste. Las mejoras de suerte hacen más probables los objetos raros.

**Transformaciones.** Una **carta terminada (Maestra) de nivel 20 o más** se puede transformar con el objeto correspondiente: Megapiedra → Mega (*M X EX*, *Mega X ex*), Banda Dynamax → VMAX, Núcleo Astral → VSTAR, Orbe Teracristal → Terastal ex. Abre la carta en el álbum y usa el botón; la carta nueva conserva el nivel y la antigua sigue en tu álbum. El objeto solo se gasta si esa carta existe (la búsqueda se hace antes). Las cartas que ya son Mega/VMAX/VSTAR no se pueden transformar otra vez.

## Protección y gradeo

Como los coleccionistas de verdad, puedes proteger tus cartas y hacer que las **gradeen**. Abre una carta en el álbum para ver su protección y el servicio de gradeo.

- **Funda** (15 monedas) y **toploader** (50 monedas): se compran en la tienda o salen en las cajas misteriosas. Cada carta puede tener una de cada una; mejoran sus opciones al gradearla.
- **Se ve lo que lleva cada carta.** La funda se dibuja sobre la carta (una película brillante y el borde superior sellado), el toploader como un marco rígido transparente con la muesca para sacarla, y una carta gradeada va en una slab con su nota. Unas etiquetas bajo el nombre lo indican (pasa el ratón para ver qué hace cada una) y muestran su **condición**; las miniaturas del álbum llevan pequeños iconos 🛡️ / 📦. **Las fundas y los toploaders no cambian las stats**: protegen la carta.
- **Desgaste.** La carta que llevas a combatir puede perder condición después de un combate: **10 %** sin protección, **2 %** con funda, **4 %** con toploader y **0 %** con las dos. Las condiciones van Mint → Near Mint → poco → moderadamente → muy jugada y no se recuperan. Cada paso baja su valor de mercado un 6 % y un poco sus opciones al gradear, y la carta lo muestra (bordes blanqueados, pliegues). Una carta gradeada está sellada en su slab y nunca se desgasta, así que conviene gradear las cartas valiosas antes de usarlas en combate.
- **Gradeo («TBGS», un servicio ficticio):** pagas una tarifa que depende de la rareza de la carta (30 monedas una Común hasta 1 200 una Secreta). La carta se queda fuera hasta que hayas usado **500 K tokens más** y vuelve con una nota del **1 al 10** (Gem Mint). Una carta en un hueco de entrenamiento hay que retirarla antes, y una carta que está fuera no puede entrenar.
- **Las probabilidades:** la nota sigue una campana (la mayoría saca un 5-7). Un Gem Mint 10 es un 0,5 % sin protección y un 8 % con funda **y** toploader.
- **Reenviar** una carta cuesta una tarifa base más cada vez y solo puede **mejorar** la nota, nunca bajarla.
- **Qué hace la nota:** la carta se muestra en una slab con su nota y su valor de mercado se multiplica (10 → ×3, 9 → ×1,8, 8 → ×1,3, 7 → ×1,1, 6 → ×1, y menos con notas bajas), lo que también cuenta en el valor de tu colección.

## Ligas online (opcional)

Reta a tus amigos con la carta que llevas a combatir y sube en un ranking compartido. Está **desactivado por defecto** y necesita un servidor de liga: el que viene por defecto lo aloja el autor, y puedes alojar el tuyo en Vercel (mira [`server/`](server/README.md), es pequeño) y poner su dirección.

- Las **ligas** son privadas: alguien crea una y comparte su **código de invitación** (como `K7MQ-4XPD`). Hasta 30 jugadores por liga. La pestaña **Liga** del álbum muestra el ranking, tu luchador y los duelos.
- **Los duelos son asíncronos.** Retas a la carta que un amigo registró; el servidor juega el combate al instante con las mismas reglas que la pestaña Combate, mueve el Elo de los dos (K = 32) y tu amigo recibe un aviso y puede ver la repetición. Límites: **10 retos al día** y **2 al día contra el mismo jugador**. Los duelos **no dan monedas** (inflarían la economía); la carta con la que peleas gana XP de combate como en cualquier otro combate.
- **Los dos usan los mismos datos.** El servidor consulta las cartas en TCGdex por su cuenta, así que una carta tiene las mismas estadísticas y precio para los dos jugadores. Tú registras tu nivel, grado y objeto equipado; para que eso sea honesto entre amigos, **un jugador nuevo puede usar cartas hasta nivel 10 y el tope sube 4 niveles al día** (lo que pase se recorta, no se rechaza). Es un freno, no una prueba: el servidor no ve tus tokens.
- **Ligas por equipos.** Al crear una liga eliges **Una carta** (por defecto) o **👥 Equipos de tres**. En una liga por equipos todos combaten con **el mismo equipo que contra el Alto Mando**: la carta que llevas a combatir más las dos de la **zona Equipo** del álbum. Un duelo es una serie de combates 1v1 donde el ganador conserva la vida que le queda y el perdedor es sustituido por la siguiente carta, hasta que un equipo se queda sin cartas; cuenta como **un** resultado para el Elo. Las dos cartas de apoyo pasan los mismos controles que el luchador (tope de nivel, y su XP cuenta en el resumen de la partida) y ganan la mitad de XP de combate, como contra el Alto Mando. Solo puedes retar, o que te reten, con el equipo completo. La arena reproduce la serie entera, combate a combate.
- **Una página de ranking compartida** en `<servidor>/l/<código de invitación>` muestra la tabla de Elo y los últimos duelos a quien tenga el código.
- **Temporadas.** Una liga juega por mes natural. Cuando empieza un mes nuevo se archiva el ranking (los tres primeros de la temporada, nunca jugadores marcados como tramposos), el Elo de todos vuelve **a medio camino de 1000** con el récord a cero, y el tablero y la página de ranking muestran el **podio de la temporada pasada** y un 🏆 junto a las temporadas ganadas de cada jugador.
- **Vitrina.** Cada jugador muestra **una carta** en sus ligas: la que fijas con **⭐ Fijar como vitrina** en el visor de carta o, si no, tu carta **más valiosa** (valor de mercado x grado x condición). Aparece junto a tu fila en la pestaña Liga y en una galería de la página pública del ranking, con su grado y un valor estimado. El servidor no puede ver tu álbum, así que es una **declaración** (solo comprueba que la carta existe y que el grado es válido), y los jugadores marcados como tramposos no muestran ninguna.
- **Privacidad.** Al activarla te pregunta antes y luego entras con la cuenta de GitHub que VS Code ya tiene. El servidor guarda solo tu **id y usuario de GitHub**, tu **carta de combate (nivel, grado, objeto)** y, para las ligas por equipos, las **dos cartas de tu equipo** (los mismos datos), la **carta de tu vitrina (cuál es y su grado)**, más o menos **cuánta cuota has gastado** (alimenta el pequeño bono por uso de tokens) y los **resultados de tus duelos**. Tu consumo, tus chats, tu código y el resto de tu colección nunca salen de tu ordenador, y el token de GitHub se comprueba una vez y nunca se guarda. **Borrar mis datos online** (pestaña Liga o paleta de comandos) elimina todo sobre ti del servidor. El ajuste con la dirección del servidor solo lo puedes cambiar tú, nunca un workspace, y la extensión solo envía tu inicio de sesión a una dirección `https`.

## Pasarse de la cuota: percances

Pasarse de la cuota puede tener consecuencias. Están **desactivadas por defecto** (se activan con `tokenBinder.mishaps.enabled`) y solo cuentan si **tú** has fijado tu propio límite mensual (el límite por defecto es solo un marcador). Cuando pasas del **100 %** de la cuota ocurre **un** percance en ese periodo (nunca más de uno por periodo). El **primer periodo** tras activarlos es gratis, y un percance solo ocurre cuando tu uso crece de verdad, así que cambiar el límite nunca lo dispara. **Las cartas en las que has invertido nunca se pierden:** los percances solo se llevan cartas *vírgenes* (sin nivel, sin protección, sin objeto, sin desgaste ni gradeo, que no entrenen ni sean tu carta de combate) y las **copias sobrantes** de las cartas en las que sí has invertido; la última copia de esas, con todo lo que lleva, siempre está a salvo.

- 🚀 **El Team Rocket** (60 %) te roba una carta sobrante al azar. Aparece en la pestaña **Combate** mientras la tengan: véncelos (Arbok, nivel 15) y te la devuelven, fusionada con lo que tienes (no se pierde nada). Sin monedas, y una derrota solo significa que lo intentas otra vez; el combate entrena a tu carta como cualquier otro.
- 🏃 **Tropiezas al correr** (30 %) y pierdes el **10 %** de tus copias sobrantes (al menos una); se pierden. **Otro 10 %** de tus cartas se rozan con el suelo y se desgastan un paso, salvo que tengan **funda**: entonces la funda recibe el golpe y se rompe. Las cartas gradeadas están a salvo en su slab.
- 🌧️ **Llueve** (10 %) sobre **la mitad** de tu álbum, como mucho **6 cartas**. Las que están en una **funda** o en una **slab** se quedan secas; el resto queda **empapado**: no vale nada y no se puede entrenar, combatir, gradear, vender ni transformar. Un **Charmandryer** (40 monedas en la tienda, un secador con la llama de la cola de Charmander) seca una carta empapada, que vuelve a servir pero «muy jugada».

Una carta en un hueco de entrenamiento va contigo y la que está en el servicio de gradeo no está en casa, así que ninguna puede ser robada, perdida ni empapada. Una notificación te cuenta lo ocurrido y abre el álbum.

## Monedas y tienda

Además de los sobres gratis, ganas **1 moneda cada 10 K tokens** usados. Hay un **bonus del +20 %** mientras tu uso del cupo vaya por debajo del ritmo del mes (por ejemplo, llevar un 40 % del cupo a mitad de mes). No se dan monedas por tokens usados antes de instalar la versión 0.3.

**Vender repetidas:** cada copia repetida da monedas según su categoría (3 · 6 · 12 · 30 · 70 · 160 · 400, de Común a Secreta), ×2 si es Shadowless y ×5 si es 1.ª edición. Siempre te quedas con una copia. El botón *Vender repetidas* del álbum las vende todas de una vez (pide confirmación).

| Artículo | Precio | Qué da |
|---|---|---|
| Sobre | 80 | 2 cartas |
| Sobre premium | 250 | 2 cartas sin comunes y con mejores probabilidades de Holo o superior |
| Pokébola | 15 | 1 carta |
| Funda | 15 | Protección para una carta (mejores opciones al gradear) |
| Toploader | 50 | Protección rígida para una carta (mejora más las opciones al gradear) |
| Caja misteriosa | 120 | 1 objeto al azar (caramelos, Huevo Suerte, objetos de combate, protección, transformaciones raras) |
| Caja de evolución | 50 | 1 piedra evolutiva, favoreciendo las líneas con ramas que tienes |
| Hueco de entrenamiento | 400 · 900 · 1 600 · 2 600 · 4 000 | Una carta más creciendo a la vez (hasta 6 huecos) |
| Mejora de suerte | 300 · 600 · 1 200 · 2 400 · 4 800 | +20 % por nivel al peso de las eras Moderna y Actual en los sobres, y a la probabilidad de variantes Shadowless (5 niveles) |

Los precios son fijos en esta versión; si te parecen caros o baratos dímelo y se ajustan.

## Copia de seguridad y cambio de equipo

Tu progreso (álbum, monedas, cartas en entrenamiento, compras) vive dentro de VS Code en este equipo. Para guardarlo o llevarlo a otro: `F1` → **TokenBinder: Exportar progreso** crea un archivo `.json`, y en el otro equipo `F1` → **TokenBinder: Importar progreso**. Importar **reemplaza** el progreso actual (pide confirmación).

**Empezar de cero:** `F1` → **TokenBinder: Reiniciar progreso**. Borra álbum, monedas, cartas en entrenamiento y mejoras, y te da un sobre de bienvenida; tus tokens y la configuración del cupo no se tocan. Te ofrece guardar antes una copia con *Exportar y reiniciar*. Los tokens que ya hayas usado en el equipo nuevo no dan monedas ni sobres retroactivos.

## Privacidad

Todo es local. La extensión **solo lee** archivos de VS Code en tu equipo y **no envía nada** a ningún servidor. Nunca lee el contenido de tus preguntas ni respuestas: solo los contadores de tokens. Las únicas peticiones de red son **descargas** de datos e imágenes de cartas desde `api.tcgdex.net` y `assets.tcgdex.net` (no se envía ningún dato tuyo; todo lo descargado queda en disco y no se vuelve a pedir) y la **búsqueda de actualizaciones**: como mucho una petición al día a `api.github.com` para saber cuál es el último release de este repositorio, sin más datos tuyos que los que lleva cualquier petición web (se desactiva con `tokenBinder.updates.check`). Si tu red corporativa bloquea esos dominios no podrás abrir sobres, pero el contador de tokens y la cuota seguirán funcionando.

## Cómo funciona

VS Code guarda cada turno del chat con sus tokens en archivos locales; TokenBinder los lee y los suma:

| Versión de VS Code | Dónde está el uso | Formato |
|---|---|---|
| Reciente (probado en 1.142) | `<datos>/Code/agentSessionData/<sesión>/session.db`, tabla `turn_usage` | SQLite |
| Anterior | `<datos>/Code/User/workspaceStorage/<hash>/chatSessions/*.jsonl` | JSON lines |

`<datos>` es `%APPDATA%` en Windows, `~/Library/Application Support` en macOS y `~/.config` (o `$XDG_CONFIG_HOME`) en Linux. También revisa `Code - Insiders` y `VSCodium`, y siempre la carpeta de la instalación de VS Code que está ejecutando la extensión (así funcionan también las instalaciones portables). Leer SQLite requiere el módulo `node:sqlite`: TokenBinder usa el de VS Code y, si no está disponible, ejecuta un proceso con el propio VS Code como Node y, como último recurso, el `node` (22.5 o superior) que tengas en el PATH.

Un turno de agente que encadena varias llamadas al modelo se cuenta completo (suma de todas las rondas) en la barra de cuota y en las cifras de uso. El juego (sobres, monedas, XP, gradeo) solo cuenta la entrada nueva y la salida: los tokens servidos desde caché no cuentan, porque un agente relee todo su contexto en cada ronda y llenaría el juego en minutos.

## Limitaciones conocidas

- **El cupo es manual.** No hay forma de leer el consumo real de la organización desde el equipo; si la empresa mide distinto (por ejemplo, ponderando por modelo), el % puede diferir.
- **Solo ve este equipo.** Si trabajas en dos máquinas, cada una cuenta lo suyo.
- **La fecha de cada turno es aproximada.** Las bases de datos no guardan la hora por turno: TokenBinder anota cuándo ve cada turno por primera vez. El histórico previo a instalar la extensión se fecha con la última modificación de su sesión.
- **Los créditos son una estimación** derivada de un campo interno de VS Code cuya semántica no está documentada. Si usas `quota.unit: credits`, contrástalo con lo que muestre GitHub.
- **El formato interno de VS Code puede cambiar** entre versiones, ya que no es una API pública.

## Solución de problemas

**El contador se queda en 0**
1. Abre `Ver > Salida` y elige **TokenBinder** en el desplegable: ahí aparece el error exacto.
2. Si dice que SQLite no está disponible, instala [Node.js](https://nodejs.org) 22.5 o superior y reinicia VS Code.
3. Comprueba que existen archivos en `agentSessionData/` o en `User/workspaceStorage/*/chatSessions/` dentro de la carpeta de datos de VS Code (Windows: `%APPDATA%\Code\`; macOS: `~/Library/Application Support/Code/`; Linux: `~/.config/Code/`). Si tu VS Code guarda el chat en otra parte (instalación portable, otra carpeta de datos), indícala en `tokenBinder.storageRoots`.
4. Ejecuta **TokenBinder: Recalcular uso**.

**No se pueden abrir sobres** (aparece «sin conexión»): comprueba que tu red permite `api.tcgdex.net` y `assets.tcgdex.net`. El sobre no se gasta si falla.

**No sale el ícono en la barra de actividad**: reinicia VS Code por completo (no basta recargar la ventana).

**`code` no se reconoce**: en VS Code, `Ctrl+Shift+P` (`Cmd+Shift+P` en Mac) → *Shell Command: Install 'code' command in PATH*.

**macOS: la instalación falla o el contador se queda en 0**: si el script no funciona, instala a mano (Opción 2: `Cmd+Shift+P` → *Extensions: Install from VSIX…*) y reinicia VS Code con `Cmd+Q` (cerrar la ventana no basta). Si el contador sigue en 0, mira `Ver > Salida > TokenBinder`; con la 1.2.0 ya no hace falta tener Node en el PATH.

Si el contador sigue sin moverse, abre un *issue* con la versión de VS Code y las **claves** (sin contenido) de una fila de `turn_usage`; el formato es lo más probable que haya cambiado.

## Desarrollo

```powershell
git clone https://github.com/SoreviR/token-binder.git
cd token-binder
npm install
npm test            # pruebas del lector, la cuota, el motor del juego y los idiomas
npm run build       # compila a dist/
npm run package     # genera token-binder-X.Y.Z.vsix
```

Pulsa **F5** en VS Code para abrir una ventana de desarrollo con la extensión cargada.


Estructura: `src/update/` (búsqueda de actualizaciones), `src/usage/` (lectura de sesiones: `journal`, `sqlite`, `extract`, `store`), `src/quota.ts` (cuota), `src/game/` (motor de sobres/entrenamiento y cliente de TCGdex), `src/i18n/` y `media/i18n.js` (textos en inglés y español), `src/webview/` y `media/` (panel lateral y pestaña del álbum).

### Publicar una versión

1. Sube la versión en `package.json`, añade una sección `## X.Y.Z - fecha` a `CHANGELOG.md` y haz commit.
2. `git tag vX.Y.Z && git push --tags`.

GitHub Actions ejecuta las pruebas, empaqueta el `.vsix` y lo adjunta al Release con la sección del changelog como notas (falla si falta); los instaladores y el actualizador de la extensión usan siempre el último release. Mantén el nombre `token-binder-X.Y.Z.vsix`: ambos dependen de él.

## Créditos y licencia

Código bajo licencia [MIT](LICENSE). Pokémon, el Pokémon TCG y los nombres e imágenes de las cartas son propiedad de Nintendo, Creatures, Game Freak y The Pokémon Company; este es un proyecto de aficionados, sin fines comerciales, y **no incluye ninguna imagen de cartas en el repositorio**: se descargan en tiempo de ejecución de [TCGdex](https://tcgdex.dev), una base de datos comunitaria y gratuita.
