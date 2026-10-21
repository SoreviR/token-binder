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

  'shop.box.name': 'Caja misteriosa',
  'shop.box.desc': '1 objeto al azar: piedras evolutivas, caramelos, objetos de transformación raros',

  'shop.sleeve.name': 'Funda',
  'shop.sleeve.desc': 'Menos desgaste en combates y mejores opciones al gradear (sin stats)',
  'shop.toploader.name': 'Toploader',
  'shop.toploader.desc': 'Con funda: sin desgaste y el mayor empujón al gradear (sin stats)',
  'shop.hair-dryer.name': 'Charmandryer',
  'shop.hair-dryer.desc': 'La llama de la cola de Charmander seca una carta empapada por la lluvia (queda muy jugada)',

  // battles
  'battle.noFighter': 'TokenBinder: elige primero la carta que llevas a combatir (ábrela en el álbum y pulsa «Llevar a combatir»).',
  'battle.grading': 'TokenBinder: tu carta de combate está en el servicio de gradeo. Elige otra o espera a que vuelva.',
  'battle.locked': 'TokenBinder: vence antes al líder anterior.',
  'battle.offline': 'TokenBinder: no se pudo encontrar la carta del líder (¿sin conexión?). Inténtalo de nuevo con conexión.',
  'battle.soaked': 'TokenBinder: tu carta de combate está empapada. Sécala con un Charmandryer o elige otra.',
  'rocket.none': 'TokenBinder: el Team Rocket no tiene ninguna carta tuya.',

  // grading
  'grade.coins': 'TokenBinder: no tienes monedas suficientes para enviar esta carta a gradear.',
  'grade.training': 'TokenBinder: retira la carta del entrenamiento antes de enviarla a gradear.',
  'grade.busy': 'TokenBinder: esta carta ya está en el servicio de gradeo.',
  'grade.none': 'TokenBinder: no se encontró esa carta.',
  'grade.soaked': 'TokenBinder: el servicio de gradeo no acepta cartas empapadas. Sécala antes con un Charmandryer.',

  // percances por pasarse de la cuota
  'mishap.rocket': 'TokenBinder: te pasaste de la cuota y el Team Rocket te robó {0}. Gánales en la pestaña Combate para recuperarla.',
  'mishap.trip': 'TokenBinder: te pasaste de la cuota, tropezaste corriendo y se te cayeron {0} cartas: {1}. Otras {2} se estropearon (un paso de desgaste) y {3} fundas se rompieron al rozar con el suelo.',
  'mishap.rain': 'TokenBinder: te pasaste de la cuota y te pilló la lluvia: {0} cartas están empapadas (un Charmandryer las salva). {1} se libraron gracias a su funda o slab.',
  'mishap.rainSaved': 'TokenBinder: te pasaste de la cuota y te pilló la lluvia, ¡pero tus fundas y slabs mantuvieron secas las {0} cartas!',
  'mishap.open': 'Abrir álbum',
  // ligas online
  'league.consent': 'Ligas online de TokenBinder\n\nSi continúas, esto se envía al servidor de la liga ({0}): tu id y tu usuario de GitHub, la carta que llevas a combatir (su nivel, grado y objeto equipado), más o menos qué parte de tu cuota mensual has gastado y los resultados de tus duelos. Tu consumo de tokens, tus chats, tu código y el resto de tu colección nunca salen de tu ordenador.\n\nPuedes borrar todo lo que el servidor guarda sobre ti cuando quieras desde la pestaña Liga.',
  'league.consentButton': 'Entrar con GitHub y continuar',
  'league.leaveConfirm': '¿Salir de la liga «{0}»? Pierdes tu puesto en su ranking.',
  'league.leave': 'Salir de la liga',
  'league.deleteConfirm': '¿Borrar todo lo que el servidor de ligas guarda sobre ti (tu cuenta, las ligas en las que estás, tu luchador y tus duelos)? Tu colección de este ordenador no se toca.',
  'league.delete': 'Borrar mis datos online',
  'league.incomingWon': 'TokenBinder: {0} te retó en «{1}» y ¡tu carta ganó!',
  'league.incomingLost': 'TokenBinder: {0} te retó en «{1}» y te ganó.',
  'league.incomingMany': 'TokenBinder: te retaron {0} veces mientras no estabas ({1} perdidas).',
  'league.watch': 'Ver repetición',
  'league.deleted': 'TokenBinder: tus datos online se han borrado.',

  // items
  'branch.item': 'TokenBinder: no tienes el objeto de esa evolución.',
  'branch.invalid': 'TokenBinder: esa carta no está esperando que elijas una evolución.',
  'transform.invalid': 'TokenBinder: esta carta no se puede transformar. Debe ser una carta terminada de nivel {0} o más que no sea ya una forma transformada, y necesitas el objeto.',
  'transform.offline': 'TokenBinder: no se pudo buscar la carta (¿sin conexión?). No se usó el objeto.',
  'transform.none': 'TokenBinder: no existe una versión {1} de {0} en la base de datos de cartas. No se usó el objeto.',
  'transform.done': 'TokenBinder: ¡{0} se convirtió en {1}!',
  'transform.kind.mega': 'Mega', 'transform.kind.vmax': 'VMAX', 'transform.kind.vstar': 'VSTAR', 'transform.kind.tera': 'Teracristal',

  // game data labels (ids come from the engine)
  'tier.0': 'Común', 'tier.1': 'Poco común', 'tier.2': 'Rara', 'tier.3': 'Holo', 'tier.4': 'Ultra', 'tier.5': 'Ilustración', 'tier.6': 'Secreta',
  'era.vintage': 'Vintage', 'era.classic': 'Clásica', 'era.bwxy': 'Black & White / XY', 'era.modern': 'Moderna', 'era.current': 'Actual',
  'variant.shadowless': 'Shadowless', 'variant.first': '1.ª edición Shadowless',
  'variant.tag.shadowless': 'SHADOWLESS', 'variant.tag.first': '1.ª ED.',
  'collector.common': 'Común de mercado', 'collector.popular': 'Popular', 'collector.valuable': 'Valiosa',
  'collector.sought': 'Muy cotizada', 'collector.chase': 'Chase', 'collector.grail': 'Grail',
};
