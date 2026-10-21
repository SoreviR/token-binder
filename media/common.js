// Pieces shared by the side panel (main.js) and the album tab (album.js).
window.PT = (function () {
  const TCOLOR = ['--t0', '--t1', '--t2', '--t3', '--t4', '--t5', '--t6'];
  const fmt = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n * 100) / 100);

  /* ───── language ───── */
  let lang = 'en';
  /** Switches the language; the host sends it with every state message. Unknown values fall back to English. */
  function setLang(l) { lang = window.I18N[l] ? l : 'en'; }
  /** Looks up a string and fills in {0}, {1}… An unknown key shows the key itself. */
  function t(key, ...args) {
    const text = window.I18N[lang][key] ?? window.I18N.en[key] ?? key;
    return text.replace(/\{(\d+)\}/g, (m, i) => (args[Number(i)] !== undefined ? String(args[Number(i)]) : m));
  }

  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
      else if (k === 'style') e.style.cssText = v; // CSSOM: allowed by the CSP (setAttribute('style') is not)
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid) e.append(kid);
    return e;
  }

  const badge = tier => el('span', { class: 'badge b' + tier, text: t('tier.' + tier) });

  /** Card with a 3D tilt that follows the mouse and a holographic shine depending on the rarity. */
  function cardEl(c, width) {
    const face = c.src ? el('img', { src: c.src, alt: c.name, draggable: 'false' }) : el('div', { class: 'missing', text: c.name });
    const root = el('div', { class: 'card3d t' + c.tier + (c.variant ? ' v-' + c.variant : ''), style: '--w:' + (width || 150) + 'px' },
      el('div', { class: 'inner' }, face, el('div', { class: 'foil' }), el('div', { class: 'glare' }),
        !c.grade && c.wear > 0 ? el('div', { class: 'wear w' + c.wear }) : null,
        c.soaked ? el('div', { class: 'wet' }) : null,
        c.care && c.care.sleeve && !c.grade ? el('div', { class: 'sleeve' }) : null, c.care && c.care.toploader && !c.grade ? el('div', { class: 'toploader' }) : null,
        c.variant ? el('div', { class: 'vtag', text: t('variant.tag.' + c.variant) }) : null));
    root.addEventListener('pointermove', e => {
      const r = root.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      root.style.setProperty('--rx', ((0.5 - y) * 20).toFixed(1) + 'deg');
      root.style.setProperty('--ry', ((x - 0.5) * 20).toFixed(1) + 'deg');
      root.style.setProperty('--mx', (x * 100).toFixed(0) + '%');
      root.style.setProperty('--my', (y * 100).toFixed(0) + '%');
      root.classList.add('active');
    });
    root.addEventListener('pointerleave', () => {
      for (const p of ['--rx', '--ry']) root.style.setProperty(p, '0deg');
      root.style.setProperty('--mx', '50%'); root.style.setProperty('--my', '50%');
      root.classList.remove('active');
    });
    return root;
  }

  /** Makes a clickable element work with the keyboard too (Tab, Enter, Space). */
  function press(node, fn, label) {
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'button');
    if (label) node.setAttribute('aria-label', label);
    node.addEventListener('click', fn);
    node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } });
    return node;
  }

  const eraName = c => (c.era ? t('era.' + c.era) : '');
  const variantName = c => (c.variant ? t('variant.' + c.variant) : '');

  /** Data line of a card: era, variant, rarity, stage, HP and set. */
  const info = c => [eraName(c), variantName(c), c.rarity, c.stage, c.hp ? t('info.hp', c.hp) : '', c.set].filter(Boolean).join(' · ');

  /** "≈ 3 days" from the tokens left and the daily pace. Empty when there is no pace. */
  function eta(remaining, perDay) {
    if (!(perDay > 0) || !(remaining > 0)) return '';
    const d = remaining / perDay;
    return d < 1 ? t('eta.lt1') : d < 60 ? t('eta.days', d < 10 ? d.toFixed(1) : Math.round(d)) : t('eta.months', Math.round(d / 30));
  }

  /** Level, XP bar and combat stats of a card. */
  function statsEl(c) {
    const s = c.stats;
    const cell = (k, v) => el('div', { class: 'stat' }, el('span', { class: 'k', text: k }), el('b', { text: String(v) }));
    return el('div', { class: 'stats' },
      el('div', { class: 'row' }, el('b', { text: t('stats.level', s.level) + (s.level >= 50 ? t('stats.max') : '') }), c.mastered ? el('span', { class: 'master', text: t('stats.master') }) : null),
      el('div', { class: 'barwrap lv' }, el('i', { style: 'width:' + Math.max(0, Math.min(100, c.lvPct)).toFixed(1) + '%' })),
      el('div', { class: 'statgrid' }, cell(t('stats.hp'), s.hp), cell(t('stats.atk'), Math.round(s.atk)), cell(t('stats.def'), s.def), cell(t('stats.spd'), s.spd)),
      c.basic ? el('div', { class: 'sub', text: t('stats.basic') }) : null);
  }

  /** Chips that say what protects a card and in what condition it is (hover for what each one does). */
  function marksEl(c) {
    const care = c.care || {};
    const chips = [];
    if (care.sleeve && !c.grade) chips.push(el('span', { class: 'mark sleeve-mark', title: t('care.tipSleeve'), text: '🛡️ ' + t('care.sleeve') }));
    if (care.toploader && !c.grade) chips.push(el('span', { class: 'mark top-mark', title: t('care.tipToploader'), text: '📦 ' + t('care.toploader') }));
    if (c.grade) chips.push(el('span', { class: 'mark slab-mark', title: t('care.tipSlab'), text: '🔒 ' + t('care.slab') }));
    else if (c.soaked) chips.push(el('span', { class: 'mark soaked-mark', title: t('care.tipSoaked'), text: t('care.soaked') }));
    else chips.push(el('span', { class: 'mark cond w' + (c.wear || 0), title: t('care.tipCondition'), text: t('condition.' + (c.wear || 0)) }));
    return el('div', { class: 'marks' }, chips);
  }

  /** A graded card sits in a slab: a frame with the grade and its name. */
  function slabEl(cardNode, c) {
    return el('div', { class: 'slab g' + c.grade },
      el('div', { class: 'slabhead', text: t('slab.label', c.grade, t('grade.' + c.grade)) }), cardNode);
  }

  /** Approximate market value and collectibility label. */
  function marketEl(c) {
    if (c.market === undefined) return el('div', { class: 'sub center', text: t('market.none') });
    const parts = [];
    if (c.eur !== undefined) parts.push('€' + c.eur.toFixed(2) + ' Cardmarket');
    if (c.usd !== undefined) parts.push('$' + c.usd.toFixed(2) + ' TCGplayer');
    return el('div', { class: 'market' },
      el('span', { class: 'coll', text: c.collector ? t('collector.' + c.collector) : '' }),
      el('span', { class: 'sub', text: parts.join(' · ') + (c.priceAt ? ' · ' + new Date(c.priceAt).toLocaleDateString(lang) : '') }),
      c.gradeMult && c.gradeMult !== 1 ? el('span', { class: 'sub', text: t('viewer.gradedValue', c.gradeMult) + ' → €' + c.market.toFixed(2) }) : null);
  }

  const ITEM_ICON = {
    'fire-stone': '🔥', 'water-stone': '💧', 'thunder-stone': '⚡', 'leaf-stone': '🍃', 'ice-stone': '❄️', 'sun-stone': '☀️',
    'moon-stone': '🌙', 'shiny-stone': '✨', 'dawn-stone': '🌅', 'kings-rock': '👑', 'rare-candy': '🍬', 'lucky-egg': '🥚',
    'mega-stone': '💎', 'dynamax-band': '🔴', 'star-core': '⭐', 'tera-orb': '🔮', sleeve: '🛡️', toploader: '📦', 'hair-dryer': '🔥',
  };
  const itemIcon = id => ITEM_ICON[id] || '🎁';
  const itemName = id => t('item.' + id + '.name');
  const itemDesc = id => t('item.' + id + '.desc');
  // Which item turns a card into which transformed form (the same table the host uses).
  const TRANSFORM_ITEM = { mega: 'mega-stone', vmax: 'dynamax-band', vstar: 'star-core', tera: 'tera-orb' };

  return { TCOLOR, fmt, el, badge, cardEl, press, info, eta, statsEl, marketEl, t, setLang, eraName, variantName, itemIcon, itemName, itemDesc, TRANSFORM_ITEM, slabEl, marksEl };
})();
