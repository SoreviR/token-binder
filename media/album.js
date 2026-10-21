(function () {
  const vscode = acquireVsCodeApi();
  const { TCOLOR, el, badge, cardEl, press, info, statsEl, marketEl, t, setLang, eraName, variantName, itemIcon, itemName, TRANSFORM_ITEM } = window.PT;
  const app = document.getElementById('app');
  const overlay = document.getElementById('overlay');
  const send = (type, extra) => vscode.postMessage(Object.assign({ type }, extra));

  let D = null;            // { album, trainingIds, freeSlots, unique, total, mastered, value, lang }
  let tier = null;         // chosen rarity tier
  let era = '';            // chosen era id ('' = all)
  let query = '';
  let sort = 'tier';
  let viewing = null;

  const SORTS = {
    tier: (a, b) => b.tier - a.tier || a.name.localeCompare(b.name),
    recent: (a, b) => b.firstAt - a.firstAt,
    name: (a, b) => a.name.localeCompare(b.name),
    count: (a, b) => b.count - a.count || b.tier - a.tier,
  };

  // Toolbar: created once so typing does not lose focus. `labelToolbar` re-applies the texts when the language changes.
  const title = el('h2');
  const summary = el('div', { class: 'sub' });
  const sellAll = el('button', { class: 'btn ghost', onclick: () => send('sellAll') });
  const search = el('input', { class: 'search', type: 'search', oninput: e => { query = e.target.value.trim().toLowerCase(); renderGrid(); } });
  const eraSel = el('select', { class: 'sorter', onchange: e => { era = e.target.value; renderGrid(); } });
  const sorter = el('select', { class: 'sorter', onchange: e => { sort = e.target.value; renderGrid(); } });
  const chips = el('div', { class: 'chips' });
  const grid = el('div', { class: 'agrid' });
  app.append(el('div', { class: 'albumhead' }, el('div', {}, title, summary), sellAll), el('div', { class: 'toolbar' }, search, eraSel, sorter), chips, grid);

  function labelToolbar() {
    title.textContent = t('album.title');
    sellAll.textContent = t('album.sellAll');
    sellAll.title = t('album.sellAllTip');
    search.placeholder = t('album.searchPlaceholder');
    search.setAttribute('aria-label', t('album.searchAria'));
    eraSel.setAttribute('aria-label', t('album.eraAria'));
    sorter.setAttribute('aria-label', t('album.sortAria'));
    sorter.replaceChildren(...Object.keys(SORTS).map(k => el('option', { value: k, text: t('sort.' + k) })));
    sorter.value = sort;
  }

  function renderEras() {
    const eras = [...new Set(D.album.map(c => c.era).filter(Boolean))];
    if (era && !eras.includes(era)) era = '';
    eraSel.replaceChildren(el('option', { value: '', text: t('album.allEras') }), ...eras.map(e => el('option', { value: e, text: t('era.' + e) })));
    eraSel.value = era;
  }

  function renderChips() {
    const tiers = [0, 1, 2, 3, 4, 5, 6];
    const counts = tiers.map(i => D.album.filter(c => c.tier === i).length);
    chips.replaceChildren(
      el('button', { class: 'chip' + (tier === null ? ' on' : ''), text: t('album.allChip', D.album.length), onclick: () => { tier = null; renderChips(); renderGrid(); } }),
      ...tiers.map(i => el('button', { class: 'chip' + (tier === i ? ' on' : ''), style: counts[i] ? '' : 'opacity:.45', text: t('tier.' + i) + ' (' + counts[i] + ')', onclick: () => { tier = i; renderChips(); renderGrid(); } })));
  }

  function renderGrid() {
    if (!D) return;
    const cards = D.album
      .filter(c => (tier === null || c.tier === tier) && (!era || c.era === era)
        && (!query || (c.name + ' ' + (c.set || '') + ' ' + c.rarity + ' ' + variantName(c)).toLowerCase().includes(query)))
      .sort(SORTS[sort]);
    if (!cards.length) {
      grid.replaceChildren(el('div', { class: 'sub', style: 'grid-column:1/-1', text: D.album.length ? t('album.noMatch') : t('album.emptyHint') }));
      return;
    }
    grid.replaceChildren(...cards.map(c => press(el('div', { class: 'thumb' + (D.trainingIds.includes(c.id) ? ' training' : '') + (c.variant ? ' v-' + c.variant : ''), style: '--tc:var(' + TCOLOR[c.tier] + ')', title: c.name + ' · ' + c.rarity },
      c.src ? el('img', { src: c.src, alt: '', loading: 'lazy' }) : el('div', { class: 'nm', text: c.name }),
      c.count > 1 ? el('span', { class: 'n', text: '×' + c.count }) : null,
      c.variant ? el('span', { class: 'vt', text: t('variant.tag.' + c.variant) }) : null,
      D.trainingIds.includes(c.id) ? el('span', { class: 'tr', text: t('album.training') }) : null,
      c.stats.level > 1 || c.mastered ? el('span', { class: 'lvl', text: (c.mastered ? '★ ' : '') + t('stats.level', c.stats.level) }) : null),
      () => openViewer(c.id), c.name + ', ' + c.rarity + (c.variant ? ', ' + variantName(c) : ''))));
  }

  function render() {
    setLang(D.lang);
    labelToolbar();
    summary.textContent = t('album.summary', D.unique, D.total, D.mastered) + (D.value ? t('album.value', D.value.toLocaleString(D.lang)) : '');
    sellAll.style.display = D.total > D.unique ? '' : 'none';
    renderEras();
    renderChips();
    renderGrid();
    if (viewing) { if (D.album.find(c => c.id === viewing)) openViewer(viewing, true); else closeViewer(); }
  }

  /* ───── single card viewer ───── */
  function openViewer(id, keepHigh) {
    const c = D.album.find(x => x.id === id);
    if (!c) return;
    const prevSrc = keepHigh ? (overlay.querySelector('.card3d img') || {}).src : null;
    viewing = id;
    const training = D.trainingIds.includes(id);
    const label = training ? t('album.training') : D.freeSlots ? t('reveal.train') : t('viewer.noSlots');
    const card = cardEl(c, 300);
    const img = card.querySelector('img');
    if (prevSrc && img) img.src = prevSrc; // do not flicker to low resolution on refresh
    overlay.replaceChildren(
      el('div', { class: 'viewer', onclick: e => e.stopPropagation() },
        card,
        el('div', { class: 'row', style: 'gap:8px;justify-content:center;margin-top:10px' }, el('b', { text: c.name }), badge(c.tier)),
        el('div', { class: 'sub center', text: info(c) }),
        statsEl(c),
        marketEl(c),
        itemButtons(c, training),
        c.count > 1 ? el('div', { class: 'sub center', text: t('viewer.copies', c.count) }) : null,
        el('div', { class: 'row', style: 'gap:8px;justify-content:center;margin-top:8px;flex-wrap:wrap' },
          training
            ? el('button', { class: 'btn ghost', text: t('viewer.untrain'), onclick: () => { send('untrain', { id }); closeViewer(); } })
            : el('button', { class: 'btn', ...(D.freeSlots ? {} : { disabled: '' }), text: label, onclick: () => { send('train', { id }); closeViewer(); } }),
          c.count > 1 ? el('button', { class: 'btn ghost', text: t('viewer.sell', c.sell), onclick: () => send('sell', { id }) }) : null,
          el('button', { class: 'btn ghost', text: t('viewer.close'), onclick: closeViewer }))));
    if (!keepHigh) send('high', { id });
    overlay.querySelector('.viewer .btn')?.focus();
  }
  /** Buttons for the items that can be used on this card: Rare Candy, Lucky Egg (if training) and the transformations it qualifies for. */
  function itemButtons(c, training) {
    const have = id => (D.items && D.items[id]) || 0;
    const buttons = [];
    if (have('rare-candy') && c.stats.level < 50) buttons.push(el('button', { class: 'btn ghost', text: itemIcon('rare-candy') + ' ' + t('viewer.useCandy', have('rare-candy')), onclick: () => send('useItem', { item: 'rare-candy', id: c.id }) }));
    if (have('lucky-egg') && training) buttons.push(el('button', { class: 'btn ghost', text: itemIcon('lucky-egg') + ' ' + t('viewer.useEgg', have('lucky-egg')), onclick: () => send('useItem', { item: 'lucky-egg', id: c.id }) }));
    for (const kind of c.transforms || []) {
      const item = TRANSFORM_ITEM[kind];
      if (have(item)) buttons.push(el('button', { class: 'btn', text: itemIcon(item) + ' ' + t('viewer.transform', have(item), t('transform.kind.' + kind)), onclick: () => { send('transform', { item, id: c.id }); closeViewer(); } }));
    }
    if (!buttons.length) return null;
    return el('div', { class: 'itemrow' }, el('div', { class: 'sub center', text: t('viewer.items') }), el('div', { class: 'row', style: 'gap:6px;justify-content:center;flex-wrap:wrap' }, buttons));
  }
  function closeViewer() { viewing = null; overlay.replaceChildren(); }
  overlay.addEventListener('click', closeViewer);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeViewer(); });

  window.addEventListener('message', ev => {
    const m = ev.data || {};
    if (m.type === 'album') { D = m.data; render(); }
    else if (m.type === 'high' && viewing === m.id) {
      const img = overlay.querySelector('.card3d img');
      if (img) img.src = m.src;
    }
  });
  vscode.postMessage({ type: 'ready' });
})();
