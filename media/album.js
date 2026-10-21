(function () {
  const vscode = acquireVsCodeApi();
  const { TCOLOR, el, badge, cardEl, press, info, statsEl, marketEl, t, setLang, eraName, variantName, itemIcon, itemName, itemDesc, TRANSFORM_ITEM, slabEl, marksEl, fmt } = window.PT;
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
  // Two tabs: the album and the battle screen (media/battle.js).
  let tab = 'album';
  const albumView = el('div', {});
  const battleView = el('div', { style: 'display:none' });
  const tabAlbum = el('button', { class: 'tab on', onclick: () => showTab('album') });
  const tabBattle = el('button', { class: 'tab', onclick: () => showTab('battle') });
  function showTab(name) {
    tab = name;
    albumView.style.display = name === 'album' ? '' : 'none';
    battleView.style.display = name === 'battle' ? '' : 'none';
    tabAlbum.classList.toggle('on', name === 'album'); tabBattle.classList.toggle('on', name === 'battle');
    if (name === 'battle') closeViewer();
  }
  albumView.append(el('div', { class: 'albumhead' }, el('div', {}, title, summary), sellAll), el('div', { class: 'toolbar' }, search, eraSel, sorter), chips, grid);
  app.append(el('div', { class: 'tabs', role: 'tablist' }, tabAlbum, tabBattle), albumView, battleView);
  window.PTBattle.init({ root: battleView, stage: document.getElementById('stage'), send });

  function labelToolbar() {
    title.textContent = t('album.title');
    tabAlbum.textContent = t('tab.album');
    tabBattle.textContent = t('tab.battle');
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
      c.grade ? el('span', { class: 'gr g' + c.grade, text: 'TBGS ' + c.grade }) : null,
      c.soaked ? el('span', { class: 'wet-tag', title: t('care.tipSoaked'), text: '💧' }) : null,
      !c.grade && (c.care.sleeve || c.care.toploader) ? el('span', { class: 'care', title: t('care.tipSleeve'), text: (c.care.sleeve ? '🛡️' : '') + (c.care.toploader ? '📦' : '') }) : null,
      c.id === D.fighterId ? el('span', { class: 'fgt', title: t('battle.isFighter'), text: '⚔' }) : null,
      c.stats.level > 1 || c.mastered ? el('span', { class: 'lvl', text: (c.mastered ? '★ ' : '') + t('stats.level', c.stats.level) }) : null),
      () => openViewer(c.id), c.name + ', ' + c.rarity + (c.variant ? ', ' + variantName(c) : ''))));
  }

  function render() {
    setLang(D.lang);
    labelToolbar();
    window.PTBattle.setData(D.battle);
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
    const framed = c.grade ? slabEl(card, c) : card;
    const img = card.querySelector('img');
    if (prevSrc && img) img.src = prevSrc; // do not flicker to low resolution on refresh
    overlay.replaceChildren(
      el('div', { class: 'viewer', onclick: e => e.stopPropagation() },
        framed,
        el('div', { class: 'row', style: 'gap:8px;justify-content:center;margin-top:10px' }, el('b', { text: c.name }), badge(c.tier)),
        el('div', { class: 'sub center', text: info(c) }),
        marksEl(c),
        statsEl(c),
        marketEl(c),
        itemButtons(c, training),
        careRow(c, training),
        heldRow(c),
        c.id === D.fighterId
          ? el('div', { class: 'sub center', style: 'margin-top:6px', text: t('battle.isFighter') })
          : el('div', { class: 'row', style: 'justify-content:center;margin-top:6px' }, el('button', { class: 'btn ghost', ...(c.soaked || c.grading ? { disabled: '' } : {}), text: '⚔ ' + t('battle.takeTo'), onclick: () => send('setFighter', { id: c.id }) })),
        c.count > 1 ? el('div', { class: 'sub center', text: t('viewer.copies', c.count) }) : null,
        el('div', { class: 'row', style: 'gap:8px;justify-content:center;margin-top:8px;flex-wrap:wrap' },
          training
            ? el('button', { class: 'btn ghost', text: t('viewer.untrain'), onclick: () => { send('untrain', { id }); closeViewer(); } })
            : el('button', { class: 'btn', ...(D.freeSlots && !c.soaked ? {} : { disabled: '' }), text: label, onclick: () => { send('train', { id }); closeViewer(); } }),
          c.count > 1 && !c.soaked ? el('button', { class: 'btn ghost', text: t('viewer.sell', c.sell), onclick: () => send('sell', { id }) }) : null,
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
  const HELD = ['sturdy-plate', 'choice-band', 'quick-claw', 'lucky-charm'];
  /** The battle item this card holds, and the ones in the inventory that can be equipped (they replace the current one). */
  function heldRow(c) {
    const have = id => (D.items && D.items[id]) || 0;
    const buttons = HELD.filter(id => id !== c.held && have(id))
      .map(id => el('button', { class: 'btn ghost', title: itemDesc(id), text: itemIcon(id) + ' ' + t('viewer.equip', itemName(id), have(id)), onclick: () => send('equip', { id: c.id, item: id }) }));
    if (c.held) buttons.push(el('button', { class: 'btn ghost', text: t('viewer.unequip', itemName(c.held)), onclick: () => send('unequip', { id: c.id }) }));
    return el('div', { class: 'itemrow' },
      el('div', { class: 'sub center', text: c.held ? t('viewer.heldTitle') + ': ' + itemIcon(c.held) + ' ' + itemName(c.held) + ' — ' + itemDesc(c.held) : t('viewer.heldNone') }),
      buttons.length ? el('div', { class: 'row', style: 'gap:6px;justify-content:center;flex-wrap:wrap;margin-top:4px' }, buttons) : null);
  }

  /** Protection (sleeve, toploader) and the grading service for this card. */
  function careRow(c, training) {
    const have = id => (D.items && D.items[id]) || 0;
    const care = c.care || {};
    const buttons = [];
    if (c.soaked) {
      return el('div', { class: 'itemrow' }, have('hair-dryer')
        ? el('div', { class: 'row', style: 'justify-content:center' }, el('button', { class: 'btn', text: itemIcon('hair-dryer') + ' ' + t('viewer.dry', have('hair-dryer')), onclick: () => send('dry', { id: c.id }) }))
        : el('div', { class: 'sub center', text: t('viewer.soakedHint') }));
    }
    if (!care.sleeve && have('sleeve')) buttons.push(el('button', { class: 'btn ghost', text: itemIcon('sleeve') + ' ' + t('viewer.protectSleeve', have('sleeve')), onclick: () => send('protect', { item: 'sleeve', id: c.id }) }));
    if (!care.toploader && have('toploader')) buttons.push(el('button', { class: 'btn ghost', text: itemIcon('toploader') + ' ' + t('viewer.protectToploader', have('toploader')), onclick: () => send('protect', { item: 'toploader', id: c.id }) }));
    let note = null;
    if (c.grading) {
      note = el('div', null, el('div', { class: 'sub center', text: t('viewer.grading', fmt(c.grading.into), fmt(c.grading.span)) }), el('div', { class: 'barwrap lv' }, el('i', { style: 'width:' + c.grading.pct.toFixed(1) + '%' })));
    } else if (training) {
      note = el('div', { class: 'sub center', text: t('viewer.gradeBlocked') });
    } else {
      buttons.push(el('button', { class: 'btn', ...(D.coins >= c.gradeCost ? {} : { disabled: '' }), text: t(c.grade ? 'viewer.regrade' : 'viewer.grade', c.gradeCost), onclick: () => send('grade', { id: c.id }) }));
    }
    const risk = c.grade ? null : el('div', { class: 'sub center', text: c.wearRisk > 0 ? t('viewer.wearRisk', Math.round(c.wearRisk * 100)) : (c.wear >= 4 ? t('viewer.noWear') : t('battle.noWearRisk')) });
    return el('div', { class: 'itemrow' }, risk, note,
      buttons.length ? el('div', { class: 'row', style: 'gap:6px;justify-content:center;flex-wrap:wrap;margin-top:4px' }, buttons) : null);
  }
  function closeViewer() { viewing = null; overlay.replaceChildren(); }
  overlay.addEventListener('click', closeViewer);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeViewer(); });

  window.addEventListener('message', ev => {
    const m = ev.data || {};
    if (m.type === 'album') { D = m.data; render(); }
    else if (m.type === 'battleResult') { showTab('battle'); window.PTBattle.play(m.data); }
    else if (m.type === 'high' && viewing === m.id) {
      const img = overlay.querySelector('.card3d img');
      if (img) img.src = m.src;
    }
  });
  vscode.postMessage({ type: 'ready' });
})();
