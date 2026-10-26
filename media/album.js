(function () {
  const vscode = acquireVsCodeApi();
  const { TCOLOR, el, badge, cardEl, press, info, statsEl, marketEl, t, setLang, eraName, variantName, itemIcon, itemName, itemDesc, TRANSFORM_ITEM, slabEl, marksEl, fmt, TYPE_ICON, typeName } = window.PT;
  const app = document.getElementById('app');
  const overlay = document.getElementById('overlay');
  const send = (type, extra) => vscode.postMessage(Object.assign({ type }, extra));

  let D = null;            // { album, trainingIds, freeSlots, unique, total, mastered, value, lang }
  let tier = null;         // chosen rarity tier
  let era = '';            // chosen era id ('' = all)
  let query = '';
  let sort = 'tier';
  let cond = '';           // chosen condition filter ('' = any)
  let typ = '';            // chosen type filter ('' = any)
  let drag = null;         // card being dragged: { id, from: 'grid' | 'dock' }
  let gear = '';           // chosen held-item filter ('' = any, 'any', 'none' or an item id)
  let viewing = null;

  const SORTS = {
    tier: (a, b) => b.tier - a.tier || a.name.localeCompare(b.name),
    recent: (a, b) => b.firstAt - a.firstAt,
    name: (a, b) => a.name.localeCompare(b.name),
    count: (a, b) => b.count - a.count || b.tier - a.tier,
    level: (a, b) => b.stats.level - a.stats.level || b.xp - a.xp || b.tier - a.tier,
    condition: (a, b) => conditionScore(b) - conditionScore(a) || b.tier - a.tier,
  };
  /** Higher is better: graded cards first (by grade), then ungraded from mint to heavily played, soaked cards last. */
  const conditionScore = c => c.soaked ? -1 : c.grade ? 100 + c.grade : 10 - (c.wear || 0);
  const COND_FILTERS = {
    graded: c => !!c.grade,
    mint: c => !c.grade && !c.soaked && !c.wear,
    worn: c => !c.grade && !c.soaked && c.wear > 0,
    soaked: c => c.soaked,
    protected: c => !c.grade && (c.care.sleeve || c.care.toploader),
  };
  const HELD = ['sturdy-plate', 'choice-band', 'quick-claw', 'lucky-charm'];
  // The inventory tab groups the items by what they are for.
  const ITEM_GROUPS = [
    ['evolve', ['fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone', 'ice-stone', 'sun-stone', 'moon-stone', 'shiny-stone', 'dawn-stone', 'kings-rock']],
    ['train', ['rare-candy', 'lucky-egg']],
    ['transform', ['mega-stone', 'dynamax-band', 'star-core', 'tera-orb']],
    ['protect', ['sleeve', 'toploader']],
    ['held', HELD],
    ['repair', ['hair-dryer']],
  ];

  // Toolbar: created once so typing does not lose focus. `labelToolbar` re-applies the texts when the language changes.
  const title = el('h2');
  const summary = el('div', { class: 'sub' });
  const sellAll = el('button', { class: 'btn ghost', onclick: () => send('sellAll') });
  const search = el('input', { class: 'search', type: 'search', oninput: e => { query = e.target.value.trim().toLowerCase(); renderGrid(); } });
  const eraSel = el('select', { class: 'sorter', onchange: e => { era = e.target.value; renderGrid(); } });
  const sorter = el('select', { class: 'sorter', onchange: e => { sort = e.target.value; renderGrid(); } });
  const condSel = el('select', { class: 'sorter', onchange: e => { cond = e.target.value; renderGrid(); } });
  const gearSel = el('select', { class: 'sorter', onchange: e => { gear = e.target.value; renderGrid(); } });
  const typeSel = el('select', { class: 'sorter', onchange: e => { typ = e.target.value; renderGrid(); } });
  const chips = el('div', { class: 'chips' });
  const dock = el('div', { class: 'dock' });
  const grid = el('div', { class: 'agrid' });
  // Three tabs: the album, the items and the battle screen (media/battle.js).
  let tab = 'album';
  const albumView = el('div', {});
  const itemsView = el('div', { style: 'display:none' });
  const battleView = el('div', { style: 'display:none' });
  const tabAlbum = el('button', { class: 'tab on', onclick: () => showTab('album') });
  const tabItems = el('button', { class: 'tab', onclick: () => showTab('items') });
  const tabBattle = el('button', { class: 'tab', onclick: () => showTab('battle') });
  const tabLeague = el('button', { class: 'tab', onclick: () => showTab('league') });
  const leagueView = el('div', { style: 'display:none' });
  const tabGoals = el('button', { class: 'tab', onclick: () => showTab('goals') });
  const goalsView = el('div', { style: 'display:none' });
  function showTab(name) {
    tab = name;
    albumView.style.display = name === 'album' ? '' : 'none';
    itemsView.style.display = name === 'items' ? '' : 'none';
    battleView.style.display = name === 'battle' ? '' : 'none';
    leagueView.style.display = name === 'league' ? '' : 'none';
    goalsView.style.display = name === 'goals' ? '' : 'none';
    tabGoals.classList.toggle('on', name === 'goals');
    tabAlbum.classList.toggle('on', name === 'album'); tabItems.classList.toggle('on', name === 'items'); tabBattle.classList.toggle('on', name === 'battle'); tabLeague.classList.toggle('on', name === 'league');
    if (name === 'league') send('leagueOpen');
    if (name !== 'album') closeViewer();
  }
  const showSlot = el('div', { class: 'showslot' });
  albumView.append(el('div', { class: 'albumhead' }, el('div', {}, title, summary), showSlot, sellAll), dock, el('div', { class: 'toolbar' }, search, eraSel, typeSel, condSel, gearSel, sorter), chips, grid);
  app.append(el('div', { class: 'tabs', role: 'tablist' }, tabAlbum, tabItems, tabBattle, tabGoals, tabLeague), albumView, itemsView, battleView, goalsView, leagueView);
  window.PTBattle.init({ root: battleView, stage: document.getElementById('stage'), send });
  window.PTLeague.init({ root: leagueView, send });

  function labelToolbar() {
    title.textContent = t('album.title');
    tabAlbum.textContent = t('tab.album');
    tabItems.textContent = t('tab.items');
    tabBattle.textContent = t('tab.battle');
    tabLeague.textContent = t('tab.league');
    tabGoals.textContent = t('tab.goals');
    sellAll.textContent = t('album.sellAll');
    sellAll.title = t('album.sellAllTip');
    search.placeholder = t('album.searchPlaceholder');
    search.setAttribute('aria-label', t('album.searchAria'));
    eraSel.setAttribute('aria-label', t('album.eraAria'));
    sorter.setAttribute('aria-label', t('album.sortAria'));
    sorter.replaceChildren(...Object.keys(SORTS).map(k => el('option', { value: k, text: t('sort.' + k) })));
    sorter.value = sort;
    typeSel.setAttribute('aria-label', t('album.typeAria'));
    condSel.setAttribute('aria-label', t('album.condAria'));
    condSel.replaceChildren(el('option', { value: '', text: t('filter.allCond') }), ...Object.keys(COND_FILTERS).map(k => el('option', { value: k, text: t('filter.' + k) })));
    condSel.value = cond;
    gearSel.setAttribute('aria-label', t('album.gearAria'));
    gearSel.replaceChildren(el('option', { value: '', text: t('filter.allGear') }), el('option', { value: 'any', text: t('filter.anyGear') }), el('option', { value: 'none', text: t('filter.noGear') }),
      ...HELD.map(id => el('option', { value: id, text: itemIcon(id) + ' ' + itemName(id) })));
    gearSel.value = gear;
  }

  /** The showcase in the album header: the card you show off in your leagues (it is visible here whether or not you play online). */
  function renderShowcase() {
    const c = D.album.find(x => x.id === D.showcaseId);
    if (!c) { showSlot.replaceChildren(); return; }
    showSlot.replaceChildren(
      press(el('div', { class: 'thumb showthumb' + (c.grade ? ' graded' : ''), style: '--tc:var(' + TCOLOR[c.tier] + ')', title: c.name }, c.src ? el('img', { src: c.src, alt: '' }) : el('div', { class: 'nm', text: c.name })), () => openViewer(c.id), c.name),
      el('div', { class: 'showtxt' }, el('b', { text: '⭐ ' + t('showcase.title') }), el('div', { class: 'sub', text: c.name + (c.grade ? ' · TBGS ' + c.grade : '') }), el('div', { class: 'sub', text: t(D.showcasePinned ? 'showcase.pinned' : 'showcase.auto') })));
  }

  function renderEras() {
    const eras = [...new Set(D.album.map(c => c.era).filter(Boolean))];
    if (era && !eras.includes(era)) era = '';
    eraSel.replaceChildren(el('option', { value: '', text: t('album.allEras') }), ...eras.map(e => el('option', { value: e, text: t('era.' + e) })));
    eraSel.value = era;
  }

  function renderTypes() {
    const types = [...new Set(D.album.flatMap(c => c.types || []))].sort((a, b) => typeName(a).localeCompare(typeName(b)));
    if (typ && !types.includes(typ)) typ = '';
    typeSel.replaceChildren(el('option', { value: '', text: t('filter.allTypes') }), ...types.map(x => el('option', { value: x, text: (TYPE_ICON[x] || '') + ' ' + typeName(x) })));
    typeSel.value = typ;
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
      .filter(c => (tier === null || c.tier === tier) && (!era || c.era === era) && (!typ || (c.types || []).includes(typ))
        && (!cond || COND_FILTERS[cond](c))
        && (!gear || (gear === 'any' ? !!c.held : gear === 'none' ? !c.held : c.held === gear))
        && (!query || (c.name + ' ' + (c.set || '') + ' ' + c.rarity + ' ' + variantName(c)).toLowerCase().includes(query)))
      .sort(SORTS[sort]);
    if (!cards.length) {
      grid.replaceChildren(el('div', { class: 'sub', style: 'grid-column:1/-1', text: D.album.length ? t('album.noMatch') : t('album.emptyHint') }));
      return;
    }
    grid.replaceChildren(...cards.map(c => draggable(c.id, 'grid', press(el('div', { class: 'thumb' + (D.frame ? ' frame-' + D.frame : '') + (D.trainingIds.includes(c.id) ? ' training' : '') + (c.variant ? ' v-' + c.variant : ''), style: '--tc:var(' + TCOLOR[c.tier] + ')', title: c.name + ' · ' + c.rarity },
      c.src ? el('img', { src: c.src, alt: '', loading: 'lazy' }) : el('div', { class: 'nm', text: c.name }),
      c.count > 1 ? el('span', { class: 'n', text: '×' + c.count }) : null,
      c.variant ? el('span', { class: 'vt', text: t('variant.tag.' + c.variant) }) : null,
      D.trainingIds.includes(c.id) ? el('span', { class: 'tr', text: t('album.training') }) : null,
      c.grade ? el('span', { class: 'gr g' + c.grade, text: 'TBGS ' + c.grade }) : null,
      !c.grade && !c.soaked && c.wear > 0 ? el('span', { class: 'cond w' + c.wear, title: t('condition.' + c.wear), text: t('condition.short.' + c.wear) }) : null,
      c.types && c.types[0] ? el('span', { class: 'ttag', title: typeName(c.types[0]), text: TYPE_ICON[c.types[0]] || '' }) : null,
      c.held ? el('span', { class: 'heldtag', title: itemName(c.held), text: itemIcon(c.held) }) : null,
      c.soaked ? el('span', { class: 'wet-tag', title: t('care.tipSoaked'), text: '💧' }) : null,
      !c.grade && (c.care.sleeve || c.care.toploader) ? el('span', { class: 'care', title: t('care.tipSleeve'), text: (c.care.sleeve ? '🛡️' : '') + (c.care.toploader ? '📦' : '') }) : null,
      c.id === D.fighterId ? el('span', { class: 'fgt', title: t('battle.isFighter'), text: '⚔' }) : null,
      c.stats.level > 1 || c.mastered ? el('span', { class: 'lvl', text: (c.mastered ? '★ ' : '') + t('stats.level', c.stats.level) }) : null),
      () => openViewer(c.id), c.name + ', ' + c.rarity + (c.variant ? ', ' + variantName(c) : '')))));
  }

  /* ───── drag and drop: cards onto the training and battle zones of the dock ───── */
  function draggable(id, from, node) {
    node.setAttribute('draggable', 'true');
    node.addEventListener('dragstart', e => {
      drag = { id, from };
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
      node.classList.add('dragging');
      document.body.classList.add('dragging-card');
      document.body.classList.toggle('drag-from-dock', from !== 'grid');
    });
    node.addEventListener('dragend', () => {
      drag = null;
      node.classList.remove('dragging');
      document.body.classList.remove('dragging-card', 'drag-from-dock');
      dock.querySelectorAll('.drop-ok, .drop-no').forEach(x => x.classList.remove('drop-ok', 'drop-no'));
      grid.classList.remove('drop-ok');
    });
    return node;
  }
  /** Makes `zone` accept the dragged card when `check(card)` returns '' (otherwise it returns why not); `act(id)` runs on drop. */
  function dropZone(zone, check, act) {
    const verdict = () => { const c = drag && D.album.find(x => x.id === drag.id); return c ? check(c) : t('dock.cannot'); };
    zone.addEventListener('dragover', e => {
      if (!drag) return;
      const why = verdict();
      zone.classList.toggle('drop-ok', !why); zone.classList.toggle('drop-no', !!why);
      zone.title = why;
      if (!why) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
    });
    zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drop-ok', 'drop-no'); });
    zone.addEventListener('drop', e => {
      e.preventDefault();
      const id = drag && drag.id, from = drag && drag.from;
      zone.classList.remove('drop-ok', 'drop-no');
      if (id && !verdict()) act(id, from);
    });
    return zone;
  }
  const miniThumb = c => el('div', { class: 'mini', style: '--tc:var(' + TCOLOR[c.tier] + ')', title: c.name },
    c.src ? el('img', { src: c.src, alt: '', draggable: 'false' }) : el('div', { class: 'nm', text: c.name }));

  function renderDock() {
    const training = D.trainingIds.map(id => D.album.find(c => c.id === id)).filter(Boolean);
    const fighter = D.album.find(c => c.id === D.fighterId);
    const slots = training.length + D.freeSlots;
    const trainZone = dropZone(
      el('div', { class: 'dz dz-train' },
        el('div', { class: 'dz-title', text: '🏋️ ' + t('dock.train') + ' (' + training.length + '/' + slots + ')' }),
        el('div', { class: 'dz-body' },
          ...training.map(c => draggable(c.id, 'dock', miniThumb(c))),
          ...Array.from({ length: D.freeSlots }, () => el('div', { class: 'mini empty', title: t('dock.drop'), text: '+' })))),
      c => D.trainingIds.includes(c.id) ? t('dock.already') : c.soaked ? t('care.tipSoaked') : !D.freeSlots ? t('dock.noFree') : '',
      id => send('train', { id }));
    const fightZone = dropZone(
      el('div', { class: 'dz dz-fight' },
        el('div', { class: 'dz-title', text: '⚔ ' + t('dock.fight') }),
        el('div', { class: 'dz-body' }, fighter ? miniThumb(fighter) : el('div', { class: 'mini empty', title: t('dock.drop'), text: '+' }), el('span', { class: 'sub', text: fighter ? fighter.name : t('dock.noFighter') }))),
      c => c.id === D.fighterId ? t('dock.already') : c.soaked ? t('care.tipSoaked') : c.grading ? t('battle.grading') : '',
      id => send('setFighter', { id }));
    const team = D.teamIds.map(id => D.album.find(c => c.id === id)).filter(Boolean);
    const teamZone = dropZone(
      el('div', { class: 'dz dz-team' },
        el('div', { class: 'dz-title', text: '👥 ' + t('dock.team') + ' (' + team.length + '/2)' }),
        el('div', { class: 'dz-body' },
          ...team.map(c => draggable(c.id, 'team', miniThumb(c))),
          ...Array.from({ length: 2 - team.length }, () => el('div', { class: 'mini empty', title: t('dock.drop'), text: '+' })))),
      c => c.id === D.fighterId || D.teamIds.includes(c.id) ? t('dock.already') : c.soaked ? t('care.tipSoaked') : c.grading ? t('battle.grading') : D.teamIds.length >= 2 ? t('dock.teamFull') : '',
      id => send('teamAdd', { id }));
    dock.replaceChildren(trainZone, fightZone, teamZone);
  }
  // Dragging a card out of the training zone and dropping it on the grid takes it out of training.
  dropZone(grid, c => (drag && ((drag.from === 'dock' && D.trainingIds.includes(c.id)) || (drag.from === 'team' && D.teamIds.includes(c.id))) ? '' : t('dock.cannot')),
    (id, from) => send(from === 'team' ? 'teamRemove' : 'untrain', { id }));

  function render() {
    setLang(D.lang);
    window.PT.setSound(D.sound);
    document.body.classList.toggle('ev-halloween', D.event === 'halloween');
    labelToolbar();
    window.PTBattle.setData(D.battle);
    summary.textContent = t('album.summary', D.unique, D.total, D.mastered) + (D.value ? t('album.value', D.value.toLocaleString(D.lang)) : '');
    sellAll.style.display = D.total > D.unique ? '' : 'none';
    renderShowcase();
    renderEras();
    renderTypes();
    renderDock();
    renderChips();
    renderGrid();
    renderItems();
    renderGoals();
    if (viewing) { if (D.album.find(c => c.id === viewing)) openViewer(viewing, true); else closeViewer(); }
  }

  /* ───── items tab: the mystery boxes and the inventory as cards ───── */
  function renderItems() {
    const have = id => (D.items && D.items[id]) || 0;
    const groups = ITEM_GROUPS.map(([kind, ids]) => [kind, ids.filter(id => have(id) > 0)]).filter(([, ids]) => ids.length);
    itemsView.replaceChildren(
      el('div', { class: 'boxbar' },
        el('div', { class: 'bb-icon', text: '🎁' }),
        el('div', { class: 'bb-text' }, el('b', { text: t('items.boxes', D.boxes || 0) }), el('div', { class: 'sub', text: t('items.boxHint') })),
        el('button', { class: 'btn', ...(D.boxes ? {} : { disabled: '' }), text: t('box.open', D.boxes || 0), onclick: () => send('openBox') })),
      el('div', { class: 'boxbar' },
        el('div', { class: 'bb-icon', text: '🪨' }),
        el('div', { class: 'bb-text' }, el('b', { text: t('items.evoBoxes', D.evoBoxes || 0) }), el('div', { class: 'sub', text: t('items.evoBoxHint') })),
        el('button', { class: 'btn', ...(D.evoBoxes ? {} : { disabled: '' }), text: t('box.openEvo', D.evoBoxes || 0), onclick: () => send('openEvoBox') })),
      el('div', { class: 'igroup' }, t('frames.title'), el('small', { text: t('frames.hint') })),
      el('div', { class: 'igrid' }, (D.frames || []).map(f => el('div', { class: 'icard' },
        el('div', { class: 'ic-top' }, el('div', { class: 'framesw frame-' + f.id }), el('div', { class: 'ic-name', text: t('frame.' + f.id + '.name') }),
          f.owned
            ? (D.frame === f.id ? el('span', { class: 'ic-n', text: t('frames.inUse') }) : el('button', { class: 'btn ghost', text: t('frames.equip'), onclick: () => send('equipFrame', { id: f.id }) }))
            : el('button', { class: 'btn', ...(D.coins >= f.price ? {} : { disabled: '' }), text: t('frames.buy', f.price), onclick: () => send('buyFrame', { id: f.id }) }))))),
      D.frame ? el('div', { class: 'row', style: 'justify-content:flex-start;margin:6px 0 12px' }, el('button', { class: 'btn ghost', text: t('frames.remove'), onclick: () => send('equipFrame', { id: '' }) })) : null,
      ...(groups.length ? [] : [el('div', { class: 'sub', text: t('items.emptyAlbum') })]),
      ...groups.map(([kind, ids]) => el('div', {},
        el('div', { class: 'igroup' }, t('items.group.' + kind), el('small', { text: t('items.hint.' + kind) })),
        el('div', { class: 'igrid' }, ids.map(id => el('div', { class: 'icard' },
          el('div', { class: 'ic-top' }, el('div', { class: 'ic-icon', text: itemIcon(id) }), el('div', { class: 'ic-name', text: itemName(id) }), el('span', { class: 'ic-n', text: '×' + have(id) })),
          el('div', { class: 'ic-desc', text: itemDesc(id) }),
          kind === 'evolve' ? el('button', { class: 'btn ghost', title: t('items.recycleTip'), text: t('items.recycle', D.stoneValue || 15), onclick: () => send('recycle', { item: id }) }) : null))))));
  }

  /* ───── goals tab: long-term targets with progress and the reward they pay ───── */
  const rewardText = r => [r.coins ? '🪙 ' + r.coins : '', r.boxes ? '🎁 ' + r.boxes : '', r.packs ? '📦 ' + r.packs : ''].filter(Boolean).join('  ');
  function renderGoals() {
    const goals = D.goals || [];
    const done = goals.filter(g => g.done).length;
    goalsView.replaceChildren(
      el('div', { class: 'albumhead' }, el('div', {}, el('h2', { text: t('goals.title') }), el('div', { class: 'sub', text: t('goals.progress', done, goals.length) }))),
      el('div', { class: 'igrid' }, goals.map(g => el('div', { class: 'icard goal' + (g.done ? ' done' : '') },
        el('div', { class: 'ic-top' }, el('div', { class: 'ic-icon', text: g.done ? '🏆' : '🎯' }), el('div', { class: 'ic-name', text: t('goal.' + g.id + '.name') }), el('span', { class: 'ic-n', text: g.done ? t('goals.done') : rewardText(g.reward) })),
        el('div', { class: 'ic-desc', text: t('goal.' + g.id + '.desc') }),
        el('div', { class: 'barwrap lv' }, el('i', { style: 'width:' + (g.value / g.goal * 100).toFixed(1) + '%' })),
        el('div', { class: 'sub', text: g.value + ' / ' + g.goal })))));
  }

  function showBox(id) {
    overlay.replaceChildren(
      el('div', { class: 'hint', text: t('box.found') }),
      el('div', { class: 'itemfound' }, el('div', { class: 'big', text: itemIcon(id) }), el('b', { text: itemName(id) }), el('div', { class: 'sub', text: itemDesc(id) })),
      el('button', { class: 'btn', text: t('box.ok'), onclick: closeViewer }));
    overlay.querySelector('.btn')?.focus();
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
    if (D.frame) card.classList.add('frame-' + D.frame);
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
        c.id !== D.fighterId ? el('div', { class: 'row', style: 'justify-content:center;margin-top:6px' }, D.teamIds.includes(id)
          ? el('button', { class: 'btn ghost', text: t('viewer.removeTeam'), onclick: () => send('teamRemove', { id }) })
          : el('button', { class: 'btn ghost', ...(c.soaked || c.grading || D.teamIds.length >= 2 ? { disabled: '' } : {}), text: t('viewer.addTeam'), onclick: () => send('teamAdd', { id }) })) : null,
        el('div', { class: 'row', style: 'justify-content:center;gap:8px;margin-top:6px;flex-wrap:wrap' },
          c.id === D.showcaseId
            ? [el('span', { class: 'sub', text: t(D.showcasePinned ? 'viewer.isShowcase' : 'viewer.showcaseAutoNote') }), D.showcasePinned ? el('button', { class: 'btn ghost', text: t('viewer.showcaseAuto'), onclick: () => send('clearShowcase') }) : null]
            : el('button', { class: 'btn ghost', ...(c.soaked ? { disabled: '' } : {}), text: t('viewer.pinShowcase'), onclick: () => send('pinShowcase', { id }) })),
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
      buttons.push(el('button', { class: 'btn ghost', text: '✖ ' + t('viewer.cancelGrade'), onclick: () => send('cancelGrade', { id: c.id }) }));
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
    else if (m.type === 'boxOpened') { showBox(m.item); }
    else if (m.type === 'showTab') { showTab(m.tab); }
    else if (m.type === 'league') { window.PTLeague.setData(m.data); }
    else if (m.type === 'cupResult') { showTab('battle'); window.PTBattle.playCup(m.rounds); }
    else if (m.type === 'battleResult') { showTab('battle'); window.PTBattle.play(m.data); }
    else if (m.type === 'high' && viewing === m.id) {
      const img = overlay.querySelector('.card3d img');
      if (img) img.src = m.src;
    }
  });
  vscode.postMessage({ type: 'ready' });
})();
