# PokeToken

Extensión de VS Code para **Windows** que mide los tokens que consumes en **GitHub Copilot Chat** mientras trabajas y los convierte en **sobres de cartas del Pokémon TCG**: abres sobres, coleccionas cartas de distintas rarezas (con efecto holográfico 3D) y las pones a entrenar para que evolucionen con tus tokens. En la barra de estado ves cuánto llevas gastado y qué **porcentaje de tu cupo mensual** representa.

Inspirada en [PokeTokenBar](https://github.com/chattymin/PokeTokenBar) (solo macOS). Proyecto personal no oficial, sin relación con GitHub, Microsoft, Nintendo ni The Pokémon Company.

```
🔥 1.24M · 42%        ← barra de estado (amarilla desde 80 %, roja al 100 %)
```

## Qué hace

- **Contador en vivo** en la barra de estado: tokens usados en el periodo y % del cupo. Se actualiza en pocos segundos tras cada respuesta del chat.
- **Tooltip con desglose** de hoy, del mes y por modelo.
- **Panel lateral** (ícono de PokeToken en la barra de actividad): sobres, carta en entrenamiento, álbum, cuota, gráfico por día y uso por modelo.
- **Alertas** al cruzar el 50 %, 80 % y 100 % del cupo.
- **Funciona con cualquier modelo** que tengas habilitado en Copilot (se cuenta por modelo) y con los modos de chat que uses.

## Instalación

Requisitos: Windows, VS Code 1.90 o superior con el comando `code` en el PATH, y Copilot Chat.

### Opción 1: un comando (recomendada)

En PowerShell:

```powershell
irm https://raw.githubusercontent.com/SoreviR/poke-token-vscode/main/install.ps1 | iex
```

Descarga el `.vsix` del último [Release](https://github.com/SoreviR/poke-token-vscode/releases/latest) y lo instala. Puedes leer el script antes de ejecutarlo: [`install.ps1`](install.ps1).

### Opción 2: a mano

1. Descarga `poke-token-X.Y.Z.vsix` desde [Releases](https://github.com/SoreviR/poke-token-vscode/releases/latest).
2. En VS Code: `Ctrl+Shift+P` → **Extensions: Install from VSIX…** → elige el archivo. O por terminal:
   ```powershell
   code --install-extension poke-token-X.Y.Z.vsix
   ```

Después **reinicia VS Code**. Para actualizar, repite cualquiera de las dos opciones.

## Configuración

Esta extensión **no consulta a GitHub ni a tu organización**: calcula el porcentaje como *tu uso local ÷ el límite que tú configures*. Pregunta a tu administrador cuál es tu cupo.

**Forma rápida:** pulsa `F1`, escribe **PokeToken: Configurar cupo mensual**, elige la unidad y escribe el número (acepta `5M`, `750k`, `5000000`). También puedes pasar el ratón sobre el contador de la barra de estado y pulsar *Configurar cupo*.

**Forma manual:** `F1` → **PokeToken: Abrir ajustes** (o `Ctrl+,` y busca `pokeToken`). Los ajustes disponibles:

| Ajuste | Por defecto | Descripción |
|---|---|---|
| `pokeToken.quota.monthlyLimit` | `5000000` | Tu cupo mensual, en la unidad elegida. **Cámbialo**: el valor por defecto es solo un marcador. |
| `pokeToken.quota.unit` | `tokens` | `tokens` o `credits` (créditos de IA de Copilot). |
| `pokeToken.quota.resetDay` | `1` | Día del mes (UTC) en que se reinicia el cupo. |
| `pokeToken.alerts.thresholds` | `[50, 80, 100]` | Porcentajes que disparan un aviso. |
| `pokeToken.packs.everyTokens` | `750000` | Cada cuántos tokens usados ganas un sobre. |
| `pokeToken.growth.multiplier` | `1` | Escala los tokens que necesita cada carta para evolucionar (0.1–2). |
| `pokeToken.storageRoots` | `[]` | Carpetas `User` de VS Code a leer, si usas una instalación no estándar. |

Comandos (`F1`): **PokeToken: Configurar cupo mensual**, **PokeToken: Abrir ajustes**, **PokeToken: Abrir panel** y **PokeToken: Recalcular uso**.

## Cómo se juega

1. **Ganas sobres con tus tokens.** Empiezas con uno de bienvenida y recibes otro cada 750 K tokens usados (`packs.everyTokens`). Si llegas al **100 % del cupo** en un periodo, ganas un sobre extra de regalo.
2. **Abres el sobre** (botón *Abrir sobre*): salen 5 cartas reales del Pokémon TCG. Cada una tiene una rareza, que se sortea así:

   | Cartas | Probabilidades |
   |---|---|
   | 3 primeras | Común 85 % · Poco común 15 % |
   | 4.ª | Poco común 80 % · Rara 20 % |
   | 5.ª | Rara 55 % · Holo 25 % · Ultra 12 % · Ilustración 6 % · Secreta 2 % |

3. **Pon una carta a entrenar** (*Entrenar*, en el sobre o desde el álbum). Mientras usas tokens, su barra avanza: a los ~1.5 M tokens **evoluciona** a la carta siguiente de su línea (por ejemplo Charmander → Charmeleon → Charizard), intentando mantener la misma rareza; las siguientes etapas duran ~4.5 M, ~6 M y ~8 M tokens. Cuando ya no tiene más evoluciones **completa su línea**, libera el hueco y te da **un sobre**. `growth.multiplier` escala estas duraciones.
4. **Coleccionas** todo en el álbum, con filtro por rareza y contador de repetidas. Pulsa una carta para verla en grande.

Las cartas muestran una inclinación 3D que sigue al ratón, y las de rareza Holo o superior añaden brillo holográfico (las Ilustración y Secretas tienen efectos propios).

## Monedas y tienda

Además de los sobres gratis, ganas **1 moneda cada 10 K tokens** usados. Hay un **bonus del +20 %** mientras tu uso del cupo vaya por debajo del ritmo del mes (por ejemplo, llevar un 40 % del cupo a mitad de mes). No se dan monedas por tokens usados antes de instalar la versión 0.3.

| Artículo | Precio | Qué da |
|---|---|---|
| Sobre | 80 | 5 cartas |
| Sobre premium | 250 | 5 cartas sin comunes y con mejores probabilidades de Holo o superior |
| Pokébola | 15 | 1 carta |
| Hueco de entrenamiento | 400 · 900 · 1 600 · 2 600 · 4 000 | Una carta más creciendo a la vez (hasta 6 huecos) |
| Mejora de suerte | 300 · 600 · 1 200 · 2 400 · 4 800 | +20 % por nivel al peso de las rarezas Holo o superiores (5 niveles) |

Los precios son fijos en esta versión; si te parecen caros o baratos dímelo y se ajustan.

## Privacidad

Todo es local. La extensión **solo lee** archivos de VS Code en tu equipo y **no envía nada** a ningún servidor. Nunca lee el contenido de tus preguntas ni respuestas: solo los contadores de tokens. Las únicas peticiones de red son **descargas** de datos e imágenes de cartas desde `api.tcgdex.net` y `assets.tcgdex.net` (no se envía ningún dato tuyo); todo lo descargado queda en disco y no se vuelve a pedir. Si tu red corporativa bloquea esos dominios no podrás abrir sobres, pero el contador de tokens y la cuota seguirán funcionando.

## Cómo funciona

VS Code guarda cada turno del chat con sus tokens en archivos locales; PokeToken los lee y los suma:

| Versión de VS Code | Dónde está el uso | Formato |
|---|---|---|
| Reciente (probado en 1.142) | `%APPDATA%\Code\agentSessionData\<sesión>\session.db`, tabla `turn_usage` | SQLite |
| Anterior | `%APPDATA%\Code\User\workspaceStorage\<hash>\chatSessions\*.jsonl` | JSON lines |

También revisa `Code - Insiders` y `VSCodium`. Leer SQLite requiere el módulo `node:sqlite`: PokeToken usa el de VS Code y, si no está disponible, el `node` (22.5 o superior) que tengas en el PATH.

Un turno de agente que encadena varias llamadas al modelo se cuenta completo (suma de todas las rondas). Los tokens servidos desde caché se cuentan en el total, igual que el uso que factura el proveedor.

## Limitaciones conocidas

- **El cupo es manual.** No hay forma de leer el consumo real de la organización desde el equipo; si la empresa mide distinto (por ejemplo, ponderando por modelo), el % puede diferir.
- **Solo ve este equipo.** Si trabajas en dos máquinas, cada una cuenta lo suyo.
- **Sin desglose por modo.** El formato nuevo no registra si el turno fue agent, plan o ask, así que "Por modo" muestra *desconocido*.
- **La fecha de cada turno es aproximada.** Las bases de datos no guardan la hora por turno: PokeToken anota cuándo ve cada turno por primera vez. El histórico previo a instalar la extensión se fecha con la última modificación de su sesión.
- **Los créditos son una estimación** derivada de un campo interno de VS Code cuya semántica no está documentada. Si usas `quota.unit: credits`, contrástalo con lo que muestre GitHub.
- **El formato interno de VS Code puede cambiar** entre versiones, ya que no es una API pública.

## Solución de problemas

**El contador se queda en 0**
1. Abre `Ver > Salida` y elige **PokeToken** en el desplegable: ahí aparece el error exacto.
2. Si dice que SQLite no está disponible, instala [Node.js](https://nodejs.org) 22.5 o superior y reinicia VS Code.
3. Comprueba que existen archivos en `%APPDATA%\Code\agentSessionData\` o en `%APPDATA%\Code\User\workspaceStorage\*\chatSessions\`. Si tu VS Code guarda el chat en otra parte (instalación portable, otra carpeta de datos), indícala en `pokeToken.storageRoots`.
4. Ejecuta **PokeToken: Recalcular uso**.

**No se pueden abrir sobres** (aparece «sin conexión»): comprueba que tu red permite `api.tcgdex.net` y `assets.tcgdex.net`. El sobre no se gasta si falla.

**No sale el ícono en la barra de actividad**: reinicia VS Code por completo (no basta recargar la ventana).

**`code` no se reconoce**: en VS Code, `Ctrl+Shift+P` → *Shell Command: Install 'code' command in PATH*.

Si el contador sigue sin moverse, abre un *issue* con la versión de VS Code y las **claves** (sin contenido) de una fila de `turn_usage`; el formato es lo más probable que haya cambiado.

## Desarrollo

```powershell
git clone https://github.com/SoreviR/poke-token-vscode.git
cd poke-token-vscode
npm install
npm test            # pruebas del lector, la cuota y el motor del juego
npm run build       # compila a dist/
npm run package     # genera poke-token-X.Y.Z.vsix
```

Pulsa **F5** en VS Code para abrir una ventana de desarrollo con la extensión cargada.

Estructura: `src/usage/` (lectura de sesiones: `journal`, `sqlite`, `extract`, `store`), `src/quota.ts` (cuota), `src/game/` (motor de sobres/entrenamiento y cliente de TCGdex), `src/webview/` y `media/` (panel lateral).

### Publicar una versión

1. Sube la versión en `package.json` y haz commit.
2. `git tag vX.Y.Z && git push --tags`.

GitHub Actions ejecuta las pruebas, empaqueta el `.vsix` y lo adjunta al Release; el instalador siempre baja el último.

## Créditos y licencia

Código bajo licencia [MIT](LICENSE). Pokémon, el Pokémon TCG y los nombres e imágenes de las cartas son propiedad de Nintendo, Creatures, Game Freak y The Pokémon Company; este es un proyecto de aficionados, sin fines comerciales, y **no incluye ninguna imagen de cartas en el repositorio**: se descargan en tiempo de ejecución de [TCGdex](https://tcgdex.dev), una base de datos comunitaria y gratuita. Idea original: [PokeTokenBar](https://github.com/chattymin/PokeTokenBar).
