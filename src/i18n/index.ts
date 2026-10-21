// Small i18n for everything the extension host shows (notifications, dialogs, tooltips, shop). The webviews have
// their own dictionary in media/i18n.js because they cannot import this code. VS Code's own l10n cannot be used
// here: it always follows the VS Code display language, and we offer a language setting of our own.
import { en, Key } from './en';
import { es } from './es';

export type Lang = 'en' | 'es';
export type LangSetting = 'auto' | Lang;

const dicts: Record<Lang, Record<Key, string>> = { en, es };
let current: Lang = 'en';

/** Resolves the `tokenBinder.language` setting; `auto` follows the VS Code display language (Spanish if it starts with "es"). */
export function resolveLang(setting: string | undefined, vscodeLanguage: string): Lang {
  if (setting === 'en' || setting === 'es') { return setting; }
  return vscodeLanguage.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function setLang(lang: Lang): void { current = lang; }
export function lang(): Lang { return current; }

/** Looks up a string and fills in {0}, {1}… An unknown key returns the key itself instead of throwing. */
export function t(key: Key, ...args: (string | number)[]): string {
  const text = dicts[current][key] ?? en[key] ?? key;
  return text.replace(/\{(\d+)\}/g, (m, i) => (args[Number(i)] !== undefined ? String(args[Number(i)]) : m));
}
