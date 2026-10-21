// English strings (the source of truth for the keys). `es.ts` must define exactly the same keys.
// Placeholders are {0}, {1}… and are filled in by `t()`.
export const en = {
  // status bar
  'bar.tooltip.title': '**TokenBinder** — {0}% of the monthly quota',
  'bar.tooltip.usage': 'Today: **{0}** tokens · Month: **{1}** tokens',
  'bar.tooltip.byModel': '**By model**',
  'bar.tooltip.noData': '- (no data)',
  'bar.tooltip.links': '[Set quota](command:tokenBinder.setQuota) · [Open panel](command:tokenBinder.open)',
  'packbar.one': 'TokenBinder: {0} unopened pack ({1} regular · {2} premium · {3} Poké Balls). Click to open the panel.',
  'packbar.many': 'TokenBinder: {0} unopened packs ({1} regular · {2} premium · {3} Poké Balls). Click to open the panel.',
  'alert.quota': 'TokenBinder: you have used {0}% of the monthly quota (threshold {1}%).',

  // messages
  'pack.openFailed': 'TokenBinder: could not open the pack (offline, or is api.tcgdex.net blocked?). The pack was not spent.',
  'sell.none': 'TokenBinder: you have no duplicate cards.',
  'sell.confirm': 'Sell {0} duplicate cards? You keep one copy of each.',
  'sell.button': 'Sell',
  'sell.done': 'TokenBinder: sold {0} duplicates for {1} coins.',

  // quota command
  'quota.unit.title': 'TokenBinder: quota unit',
  'quota.unit.current': 'Current: {0}',
  'quota.unit.tokens': 'Quota measured in tokens',
  'quota.unit.credits': 'Quota measured in Copilot AI credits',
  'quota.title': 'TokenBinder: monthly quota',
  'quota.prompt': 'Your quota in {0}. Accepts the suffixes K, M, B (e.g. 5M = 5,000,000).',
  'quota.invalid': 'Enter a number greater than 0, e.g. 5000000 or 5M',
  'quota.set': 'TokenBinder: quota set to {0} {1}.',

  // export / import / reset
  'export.title': 'Export TokenBinder progress',
  'export.done': 'TokenBinder: progress exported ({0} different cards, {1} coins).',
  'reset.confirm': 'Reset TokenBinder from scratch? This deletes {0} different cards, {1} coins, the cards in training and the upgrades you bought. Your tokens and quota settings are kept. Recommended: save a copy first.',
  'reset.exportFirst': 'Export and reset',
  'reset.noCopy': 'Reset without a copy',
  'reset.done': 'TokenBinder: progress reset. You have a welcome pack.',
  'import.title': 'Import TokenBinder progress',
  'import.invalid': 'TokenBinder: the file is not valid progress exported by TokenBinder.',
  'import.confirm': 'This replaces your current progress with the one in the file ({0} different cards, {1} coins). Continue?',
  'import.replace': 'Replace',
  'import.done': 'TokenBinder: progress imported.',

  'import.tooNew': 'TokenBinder: this file was exported by a newer version of TokenBinder. Update TokenBinder first, then import it again.',

  // updates
  'update.available': 'TokenBinder {0} is available (you have {1}). Update now?',
  'update.now': 'Update now',
  'update.notes': 'Release notes',
  'update.skip': 'Skip this version',
  'update.downloading': 'Downloading TokenBinder {0}…',
  'update.installed': 'TokenBinder {0} is installed. Reload VS Code to start using it.',
  'update.reload': 'Reload now',
  'update.failed': 'TokenBinder: the update failed ({0}). You can update by hand by running the installer again (see the README).',
  'update.upToDate': 'TokenBinder {0} is up to date.',
  'update.checkFailed': 'TokenBinder: could not check for updates (offline, or GitHub is unreachable).',

  // legacy PokeToken migration
  'legacy.offer': 'TokenBinder replaces PokeToken (the same extension under a new name). Your progress and settings are already recovered. Uninstall the old version to avoid duplicates?',
  'legacy.uninstall': 'Uninstall PokeToken',
  'legacy.later': 'Later',
  'legacy.done': 'PokeToken uninstalled. Restart VS Code to finish.',

  // shop
  'shop.pack.name': 'Pack',
  'shop.pack.desc': '2 cards',
  'shop.premium.name': 'Premium pack',
  'shop.premium.desc': '2 cards, better rarities',
  'shop.ball.name': 'Poké Ball',
  'shop.ball.desc': '1 card',
  'shop.slot.name': 'Training slot',
  'shop.slot.desc': '{0}/{1} · one more card growing',
  'shop.luck.name': 'Luck upgrade',
  'shop.luck.desc': 'level {0}/{1} · +20% per level to modern eras and Shadowless variants',

  'shop.box.name': 'Mystery box',
  'shop.box.desc': '1 random item: evolution stones, candy, rare transformation items',

  'shop.sleeve.name': 'Sleeve',
  'shop.sleeve.desc': 'Less wear in battles and better grading odds (no stats)',
  'shop.toploader.name': 'Toploader',
  'shop.toploader.desc': 'With a sleeve: no wear and the best grading boost (no stats)',
  'shop.hair-dryer.name': 'Charmandryer',
  'shop.hair-dryer.desc': 'Charmander\'s tail flame dries one card soaked by the rain (it stays Heavily Played)',

  // battles
  'battle.noFighter': 'TokenBinder: choose the card you take to battle first (open it in the album and press "Take to battle").',
  'battle.grading': 'TokenBinder: your battle card is at the grading service. Choose another one or wait for it to come back.',
  'battle.locked': 'TokenBinder: beat the previous gym leader first.',
  'battle.soaked': 'TokenBinder: your battle card is soaked. Dry it with a Charmandryer or choose another one.',
  'rocket.none': 'TokenBinder: Team Rocket has none of your cards.',
  'battle.offline': 'TokenBinder: could not find the leader\'s card (offline?). Try again with a connection.',

  // grading
  'grade.coins': 'TokenBinder: you do not have enough coins to send this card for grading.',
  'grade.training': 'TokenBinder: retire the card from training before sending it for grading.',
  'grade.busy': 'TokenBinder: this card is already at the grading service.',
  'grade.none': 'TokenBinder: that card was not found.',
  'grade.soaked': 'TokenBinder: the grading service does not take soaked cards. Dry it with a Charmandryer first.',

  // mishaps for going over the quota
  'mishap.rocket': 'TokenBinder: you went over the quota and Team Rocket stole {0}! Beat them in the Battle tab to get it back.',
  'mishap.trip': 'TokenBinder: you went over the quota, tripped while running and dropped {0} cards: {1}. {2} more got scuffed (one step of wear) and {3} sleeves were torn on the ground.',
  'mishap.rain': 'TokenBinder: you went over the quota and got caught in the rain: {0} cards are soaked (a Charmandryer saves them). {1} stayed dry in their sleeve or slab.',
  'mishap.rainSaved': 'TokenBinder: you went over the quota and got caught in the rain, but your sleeves and slabs kept all {0} cards dry!',
  'mishap.open': 'Open album',
  // online leagues
  'league.consent': 'TokenBinder online leagues\n\nIf you continue, this is sent to the league server ({0}): your GitHub id and login, the card you take to battle (its level, grade and held item), roughly how much of your monthly quota you have used, and your duel results. Your token usage, your chats, your code and the rest of your collection never leave your computer.\n\nYou can delete everything the server holds about you at any time from the League tab.',
  'league.consentButton': 'Sign in with GitHub and continue',
  'league.leaveConfirm': 'Leave the league "{0}"? Your place in its ranking is lost.',
  'league.leave': 'Leave league',
  'league.deleteConfirm': 'Delete everything the league server holds about you (your account, leagues you are in, your fighter and your duels)? Your collection on this computer is not touched.',
  'league.delete': 'Delete my online data',
  'league.incomingWon': 'TokenBinder: {0} challenged you in "{1}" and your card won!',
  'league.incomingLost': 'TokenBinder: {0} challenged you in "{1}" and beat you.',
  'league.incomingMany': 'TokenBinder: you were challenged {0} times while you were away ({1} lost).',
  'league.watch': 'Watch replay',
  'league.deleted': 'TokenBinder: your online data was deleted.',

  // items
  'branch.item': 'TokenBinder: you do not have the item for that evolution.',
  'branch.invalid': 'TokenBinder: that card is not waiting for an evolution choice.',
  'transform.invalid': 'TokenBinder: this card cannot be transformed. It must be a finished card of level {0} or higher that is not already a transformed form, and you need the item.',
  'transform.offline': 'TokenBinder: could not look the card up (offline?). The item was not used.',
  'transform.none': 'TokenBinder: no {1} version of {0} exists in the card database. The item was not used.',
  'transform.done': 'TokenBinder: {0} became {1}!',
  'transform.kind.mega': 'Mega', 'transform.kind.vmax': 'VMAX', 'transform.kind.vstar': 'VSTAR', 'transform.kind.tera': 'Terastal',

  // game data labels (ids come from the engine)
  'tier.0': 'Common', 'tier.1': 'Uncommon', 'tier.2': 'Rare', 'tier.3': 'Holo', 'tier.4': 'Ultra', 'tier.5': 'Illustration', 'tier.6': 'Secret',
  'era.vintage': 'Vintage', 'era.classic': 'Classic', 'era.bwxy': 'Black & White / XY', 'era.modern': 'Modern', 'era.current': 'Current',
  'variant.shadowless': 'Shadowless', 'variant.first': '1st Edition Shadowless',
  'variant.tag.shadowless': 'SHADOWLESS', 'variant.tag.first': '1ST ED.',
  'collector.common': 'Market common', 'collector.popular': 'Popular', 'collector.valuable': 'Valuable',
  'collector.sought': 'Highly sought', 'collector.chase': 'Chase', 'collector.grail': 'Grail',
};

export type Key = keyof typeof en;
