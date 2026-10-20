# PokeToken

Extensión de VS Code para **Windows** que mide los tokens que consumes en **GitHub Copilot Chat** mientras trabajas y los convierte en un compañero Pokémon que crece: el huevo eclosiona, evoluciona y se gradúa a tu Pokédex. En la barra de estado ves cuánto llevas gastado y qué **porcentaje de tu cupo mensual** representa.

Inspirada en [PokeTokenBar](https://github.com/chattymin/PokeTokenBar) (solo macOS). Proyecto personal no oficial, sin relación con GitHub, Microsoft, Nintendo ni The Pokémon Company.

```
🔥 1.24M · 42%        ← barra de estado (amarilla desde 80 %, roja al 100 %)
```

## Qué hace

- **Contador en vivo** en la barra de estado: tokens usados en el periodo y % del cupo. Se actualiza en pocos segundos tras cada respuesta del chat.
- **Tooltip con desglose** de hoy, del mes y por modelo.
- **Panel lateral** (ícono de PokeToken en la barra de actividad): mascota animada, progreso a la siguiente etapa, cuota, gráfico por día, uso por modelo y Pokédex.
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
| `pokeToken.growth.multiplier` | `1` | Escala los tokens que necesita el Pokémon para crecer (0.1–2). |
| `pokeToken.storageRoots` | `[]` | Carpetas `User` de VS Code a leer, si usas una instalación no estándar. |

Comandos (`F1`): **PokeToken: Configurar cupo mensual**, **PokeToken: Abrir ajustes**, **PokeToken: Abrir panel** y **PokeToken: Recalcular uso**.

## El Pokémon

- El huevo eclosiona con ~150 K tokens, evoluciona a ~1.5 M y ~6 M, y se gradúa ~8 M después de su última evolución. Todos los umbrales se escalan con `growth.multiplier`.
- Hay un 1/512 de probabilidad de que sea **shiny**, y cada uno tiene una naturaleza.
- Llegar al **100 % del cupo** en un periodo da una Rare Candy (adelanta el crecimiento, una vez por periodo).
- Los sprites se descargan una sola vez de [PokéAPI/sprites](https://github.com/PokeAPI/sprites) y se guardan en disco; sin internet verás un huevo dibujado.

## Privacidad

Todo es local. La extensión **solo lee** archivos de VS Code en tu equipo y **no envía nada** a ningún servidor. La única petición de red es la descarga de sprites a `raw.githubusercontent.com`. Nunca lee el contenido de tus preguntas ni respuestas: solo los contadores de tokens.

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

Estructura: `src/usage/` (lectura de sesiones: `journal`, `sqlite`, `extract`, `store`), `src/quota.ts` (cuota), `src/game/` (motor del Pokémon y sprites), `src/webview/` y `media/` (panel lateral).

### Publicar una versión

1. Sube la versión en `package.json` y haz commit.
2. `git tag vX.Y.Z && git push --tags`.

GitHub Actions ejecuta las pruebas, empaqueta el `.vsix` y lo adjunta al Release; el instalador siempre baja el último.

## Créditos y licencia

Código bajo licencia [MIT](LICENSE). Pokémon y sus nombres e imágenes son marcas de Nintendo, Game Freak y The Pokémon Company; este es un proyecto de aficionados, sin fines comerciales, y no incluye ningún sprite en el repositorio (se descargan de PokéAPI en tiempo de ejecución). Idea original: [PokeTokenBar](https://github.com/chattymin/PokeTokenBar).
