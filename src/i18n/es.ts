// Spanish strings. Typed against the English keys: a missing or extra key is a compile error.
import type { Key } from './en';

export const es: Record<Key, string> = {
  // status bar
  'bar.tooltip.title': '**TokenBinder** — {0}% del cupo mensual',
  'bar.tooltip.usage': 'Hoy: **{0}** tokens · Mes: **{1}** tokens',
  'bar.tooltip.byModel': '**Por modelo**',
  'bar.tooltip.noData': '- (sin datos)',
  'bar.tooltip.links': '[Configurar cupo](command:tokenBinder.setQuota) · [Abrir panel](command:tokenBinder.open)',
  'packbar.one': 'TokenBinder: {0} sobre sin abrir ({1} normales · {2} premium · {3} Pokébolas). Pulsa para abrir el panel.',
  'packbar.many': 'TokenBinder: {0} sobres sin abrir ({1} normales · {2} premium · {3} Pokébolas). Pulsa para abrir el panel.',
  'alert.quota': 'TokenBinder: llevas {0}% del cupo mensual (umbral {1}%).',

  // messages
  'pack.openFailed': 'TokenBinder: no se pudo abrir el sobre (¿sin conexión o red bloqueada a api.tcgdex.net?). No se gastó el sobre.',
  'sell.none': 'TokenBinder: no tienes cartas repetidas.',
  'sell.confirm': '¿Vender {0} cartas repetidas? Te quedas con una copia de cada una.',
  'sell.button': 'Vender',
  'sell.done': 'TokenBinder: vendiste {0} repetidas por {1} monedas.',

  // quota command
  'quota.unit.title': 'TokenBinder: unidad del cupo',
  'quota.unit.current': 'Actual: {0}',
  'quota.unit.tokens': 'Cupo medido en tokens',
  'quota.unit.credits': 'Cupo medido en créditos de IA de Copilot',
  'quota.title': 'TokenBinder: cupo mensual',
  'quota.prompt': 'Tu cupo en {0}. Acepta sufijos K, M, B (ej. 5M = 5.000.000).',
  'quota.invalid': 'Escribe un número mayor que 0, p. ej. 5000000 o 5M',
  'quota.set': 'TokenBinder: cupo fijado en {0} {1}.',

  // export / import / reset
  'export.title': 'Exportar progreso de TokenBinder',
  'export.done': 'TokenBinder: progreso exportado ({0} cartas distintas, {1} monedas).',
  'reset.confirm': '¿Reiniciar TokenBinder desde cero? Se borran {0} cartas distintas, {1} monedas, las cartas en entrenamiento y las mejoras compradas. Se conservan tus tokens y la configuración del cupo. Recomendado: guardar antes una copia.',
  'reset.exportFirst': 'Exportar y reiniciar',
  'reset.noCopy': 'Reiniciar sin copia',
  'reset.done': 'TokenBinder: progreso reiniciado. Tienes un sobre de bienvenida.',
  'import.title': 'Importar progreso de TokenBinder',
  'import.invalid': 'TokenBinder: el archivo no es un progreso válido exportado por TokenBinder.',
  'import.confirm': 'Esto reemplaza tu progreso actual por el del archivo ({0} cartas distintas, {1} monedas). ¿Continuar?',
  'import.replace': 'Reemplazar',
  'import.done': 'TokenBinder: progreso importado.',

  'import.tooNew': 'TokenBinder: este archivo lo exportó una versión más nueva de TokenBinder. Actualiza TokenBinder primero y vuelve a importarlo.',

  // updates
  'update.available': 'Hay una versión nueva de TokenBinder: {0} (tienes la {1}). ¿Actualizar ahora?',
  'update.now': 'Actualizar ahora',
  'update.notes': 'Ver novedades',
  'update.skip': 'Omitir esta versión',
  'update.downloading': 'Descargando TokenBinder {0}…',
  'update.installed': 'TokenBinder {0} está instalado. Recarga VS Code para empezar a usarlo.',
  'update.reload': 'Recargar ahora',
  'update.failed': 'TokenBinder: falló la actualización ({0}). Puedes actualizar a mano volviendo a ejecutar el instalador (mira el README).',
  'update.upToDate': 'TokenBinder {0} está al día.',
  'update.checkFailed': 'TokenBinder: no se pudo buscar actualizaciones (sin conexión, o GitHub no responde).',

  // legacy PokeToken migration
  'legacy.offer': 'TokenBinder reemplaza a PokeToken (misma extensión con otro nombre). Ya recuperé tu progreso y tus ajustes. ¿Desinstalar la versión antigua para evitar duplicados?',
  'legacy.uninstall': 'Desinstalar PokeToken',
  'legacy.later': 'Más tarde',
  'legacy.done': 'PokeToken desinstalada. Reinicia VS Code para terminar.',

  // shop
  'shop.pack.name': 'Sobre',
  'shop.pack.desc': '2 cartas',
  'shop.premium.name': 'Sobre premium',
  'shop.premium.desc': '2 cartas, mejores rarezas',
  'shop.ball.name': 'Pokébola',
  'shop.ball.desc': '1 carta',
  'shop.slot.name': 'Hueco de entrenamiento',
  'shop.slot.desc': '{0}/{1} · una carta más creciendo',
  'shop.luck.name': 'Mejora de suerte',
  'shop.luck.desc': 'nivel {0}/{1} · +20 % por nivel a las eras modernas y a las variantes Shadowless',

  // game data labels (ids come from the engine)
  'tier.0': 'Común', 'tier.1': 'Poco común', 'tier.2': 'Rara', 'tier.3': 'Holo', 'tier.4': 'Ultra', 'tier.5': 'Ilustración', 'tier.6': 'Secreta',
  'era.vintage': 'Vintage', 'era.classic': 'Clásica', 'era.bwxy': 'Black & White / XY', 'era.modern': 'Moderna', 'era.current': 'Actual',
  'variant.shadowless': 'Shadowless', 'variant.first': '1.ª edición Shadowless',
  'variant.tag.shadowless': 'SHADOWLESS', 'variant.tag.first': '1.ª ED.',
  'collector.common': 'Común de mercado', 'collector.popular': 'Popular', 'collector.valuable': 'Valiosa',
  'collector.sought': 'Muy cotizada', 'collector.chase': 'Chase', 'collector.grail': 'Grail',
};
