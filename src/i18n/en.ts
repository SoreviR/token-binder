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

  // game data labels (ids come from the engine)
  'tier.0': 'Common', 'tier.1': 'Uncommon', 'tier.2': 'Rare', 'tier.3': 'Holo', 'tier.4': 'Ultra', 'tier.5': 'Illustration', 'tier.6': 'Secret',
  'era.vintage': 'Vintage', 'era.classic': 'Classic', 'era.bwxy': 'Black & White / XY', 'era.modern': 'Modern', 'era.current': 'Current',
  'variant.shadowless': 'Shadowless', 'variant.first': '1st Edition Shadowless',
  'variant.tag.shadowless': 'SHADOWLESS', 'variant.tag.first': '1ST ED.',
  'collector.common': 'Market common', 'collector.popular': 'Popular', 'collector.valuable': 'Valuable',
  'collector.sought': 'Highly sought', 'collector.chase': 'Chase', 'collector.grail': 'Grail',
};

export type Key = keyof typeof en;
