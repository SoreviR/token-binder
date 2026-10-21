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

Después **reinicia VS Code**. Para actualizar, repite cualquiera de las dos opciones.

## Configuración

Esta extensión **no consulta a GitHub ni a tu organización**: calcula el porcentaje como *tu uso local ÷ el límite que tú configures*. Pregunta a tu administrador cuál es tu cupo.

**Forma rápida:** pulsa `F1`, escribe **TokenBinder: Configurar cupo mensual**, elige la unidad y escribe el número (acepta `5M`, `750k`, `5000000`). También puedes pasar el ratón sobre el contador de la barra de estado y pulsar *Configurar cupo*.

**Forma manual:** `F1` → **TokenBinder: Abrir ajustes** (o `Ctrl+,` y busca `tokenBinder`). Los ajustes disponibles:

| Ajuste | Por defecto | Descripción |
|---|---|---|
| `tokenBinder.language` | `auto` | Idioma de la interfaz: `auto` (sigue al de VS Code: español si es español, inglés en otro caso), `en` o `es`. Cambia en caliente, sin reiniciar. |
| `tokenBinder.quota.monthlyLimit` | `5000000` | Tu cupo mensual, en la unidad elegida. **Cámbialo**: el valor por defecto es solo un marcador. |
| `tokenBinder.quota.unit` | `tokens` | `tokens` o `credits` (créditos de IA de Copilot). |
| `tokenBinder.quota.resetDay` | `1` | Día del mes (UTC) en que se reinicia el cupo. |
| `tokenBinder.alerts.thresholds` | `[50, 80, 100]` | Porcentajes que disparan un aviso. |
| `tokenBinder.packs.everyTokens` | `750000` | Cada cuántos tokens usados ganas un sobre. |
| `tokenBinder.growth.multiplier` | `1` | Escala los tokens que necesita cada carta para evolucionar (0.1–2). |
| `tokenBinder.storageRoots` | `[]` | Carpetas `User` de VS Code a leer, si usas una instalación no estándar. |

Los títulos de los comandos y las descripciones de los ajustes en la ventana de Ajustes de VS Code siguen el idioma de VS Code; todo lo demás (panel, álbum, avisos, diálogos) sigue a `tokenBinder.language`.

Comandos (`F1`): **TokenBinder: Abrir álbum**, **TokenBinder: Exportar progreso**, **TokenBinder: Importar progreso**, **TokenBinder: Reiniciar progreso**, **TokenBinder: Configurar cupo mensual**, **TokenBinder: Abrir ajustes**, **TokenBinder: Abrir panel** y **TokenBinder: Recalcular uso**.

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
- **Stats (PS, ATQ, DEF, VEL):** salen de los datos reales de la carta (PS, daño de sus ataques, coste de retirada), normalizados por era para que una vintage y una VMAX sean comparables, y mejoran con el nivel, la etapa y la rareza. Por ahora solo se muestran; se usarán en los combates. Las cartas que ya tenías se completan solas al abrir el álbum (hace falta conexión).
- **Valor de mercado:** el visor del álbum muestra un precio aproximado (tendencia de Cardmarket en € y precio de TCGplayer en $), una etiqueta de coleccionismo (*Común de mercado* → *Grail*) y el valor aproximado de toda tu colección. Se actualiza al mirar una carta si tiene más de 7 días. Es el precio de la carta normal (no distingue Shadowless) y es solo informativo: **no cambia** lo que te dan las monedas.

## Monedas y tienda

Además de los sobres gratis, ganas **1 moneda cada 10 K tokens** usados. Hay un **bonus del +20 %** mientras tu uso del cupo vaya por debajo del ritmo del mes (por ejemplo, llevar un 40 % del cupo a mitad de mes). No se dan monedas por tokens usados antes de instalar la versión 0.3.

**Vender repetidas:** cada copia repetida da monedas según su categoría (3 · 6 · 12 · 30 · 70 · 160 · 400, de Común a Secreta), ×2 si es Shadowless y ×5 si es 1.ª edición. Siempre te quedas con una copia. El botón *Vender repetidas* del álbum las vende todas de una vez (pide confirmación).

| Artículo | Precio | Qué da |
|---|---|---|
| Sobre | 80 | 2 cartas |
| Sobre premium | 250 | 2 cartas sin comunes y con mejores probabilidades de Holo o superior |
| Pokébola | 15 | 1 carta |
| Hueco de entrenamiento | 400 · 900 · 1 600 · 2 600 · 4 000 | Una carta más creciendo a la vez (hasta 6 huecos) |
| Mejora de suerte | 300 · 600 · 1 200 · 2 400 · 4 800 | +20 % por nivel al peso de las eras Moderna y Actual en los sobres, y a la probabilidad de variantes Shadowless (5 niveles) |

Los precios son fijos en esta versión; si te parecen caros o baratos dímelo y se ajustan.

## Copia de seguridad y cambio de equipo

Tu progreso (álbum, monedas, cartas en entrenamiento, compras) vive dentro de VS Code en este equipo. Para guardarlo o llevarlo a otro: `F1` → **TokenBinder: Exportar progreso** crea un archivo `.json`, y en el otro equipo `F1` → **TokenBinder: Importar progreso**. Importar **reemplaza** el progreso actual (pide confirmación).

**Empezar de cero:** `F1` → **TokenBinder: Reiniciar progreso**. Borra álbum, monedas, cartas en entrenamiento y mejoras, y te da un sobre de bienvenida; tus tokens y la configuración del cupo no se tocan. Te ofrece guardar antes una copia con *Exportar y reiniciar*. Los tokens que ya hayas usado en el equipo nuevo no dan monedas ni sobres retroactivos.

## Privacidad

Todo es local. La extensión **solo lee** archivos de VS Code en tu equipo y **no envía nada** a ningún servidor. Nunca lee el contenido de tus preguntas ni respuestas: solo los contadores de tokens. Las únicas peticiones de red son **descargas** de datos e imágenes de cartas desde `api.tcgdex.net` y `assets.tcgdex.net` (no se envía ningún dato tuyo); todo lo descargado queda en disco y no se vuelve a pedir. Si tu red corporativa bloquea esos dominios no podrás abrir sobres, pero el contador de tokens y la cuota seguirán funcionando.

## Cómo funciona

VS Code guarda cada turno del chat con sus tokens en archivos locales; TokenBinder los lee y los suma:

| Versión de VS Code | Dónde está el uso | Formato |
|---|---|---|
| Reciente (probado en 1.142) | `<datos>/Code/agentSessionData/<sesión>/session.db`, tabla `turn_usage` | SQLite |
| Anterior | `<datos>/Code/User/workspaceStorage/<hash>/chatSessions/*.jsonl` | JSON lines |

`<datos>` es `%APPDATA%` en Windows, `~/Library/Application Support` en macOS y `~/.config` (o `$XDG_CONFIG_HOME`) en Linux. También revisa `Code - Insiders` y `VSCodium`, y siempre la carpeta de la instalación de VS Code que está ejecutando la extensión (así funcionan también las instalaciones portables). Leer SQLite requiere el módulo `node:sqlite`: TokenBinder usa el de VS Code y, si no está disponible, ejecuta un proceso con el propio VS Code como Node y, como último recurso, el `node` (22.5 o superior) que tengas en el PATH.

Un turno de agente que encadena varias llamadas al modelo se cuenta completo (suma de todas las rondas). Los tokens servidos desde caché se cuentan en el total, igual que el uso que factura el proveedor.

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

Estructura: `src/usage/` (lectura de sesiones: `journal`, `sqlite`, `extract`, `store`), `src/quota.ts` (cuota), `src/game/` (motor de sobres/entrenamiento y cliente de TCGdex), `src/i18n/` y `media/i18n.js` (textos en inglés y español), `src/webview/` y `media/` (panel lateral y pestaña del álbum).

### Publicar una versión

1. Sube la versión en `package.json` y haz commit.
2. `git tag vX.Y.Z && git push --tags`.

GitHub Actions ejecuta las pruebas, empaqueta el `.vsix` y lo adjunta al Release; el instalador siempre baja el último.

## Créditos y licencia

Código bajo licencia [MIT](LICENSE). Pokémon, el Pokémon TCG y los nombres e imágenes de las cartas son propiedad de Nintendo, Creatures, Game Freak y The Pokémon Company; este es un proyecto de aficionados, sin fines comerciales, y **no incluye ninguna imagen de cartas en el repositorio**: se descargan en tiempo de ejecución de [TCGdex](https://tcgdex.dev), una base de datos comunitaria y gratuita.
