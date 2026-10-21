(function () {
  const vscode = acquireVsCodeApi();
  const { TCOLOR, fmt, el, badge, cardEl, press, info, eta, statsEl, t, setLang, eraName, variantName, itemIcon, itemName, itemDesc } = window.PT;
  const app = document.getElementById('app');
  const overlay = document.getElementById('overlay');

  let S = null;            // last state received
  let warned = 0;
  const row = (a, b) => el('div', { class: 'row' }, el('span', { text: a }), el('span', { text: b }));
  const box = (title, ...kids) => el('div', { class: 'card-box' }, title && el('h4', { text: title }), ...kids);
  const bar = (pct, cls) => el('div', { class: 'barwrap ' + (cls || '') }, el('i', { style: 'width:' + Math.max(0, Math.min(100, pct)).toFixed(1) + '%' }));
  const send = (type, extra) => vscode.postMessage(Object.assign({ type }, extra));
  const freeSlot = () => !!S && S.slots.some(s => s === null);

  /* ───── main panel ───── */
  function render() {
    const d = S;
    const q = d.pct;
    const unit = d.unit === 'credits' ? t('unit.credits') : t('unit.tokens');

    const openBtn = (kind, n, label) => el('button', { class: 'btn' + (kind === 'pack' ? '' : ' ghost'), ...(n ? {} : { disabled: '' }), text: label + ' (' + n + ')', onclick: () => send('openPack', { kind }) });
    const packBox = box(t('packs.title'),
      el('div', { class: 'packrow' },
        el('div', { class: 'pack' }, el('div', { class: 'ball' }), el('b', { text: 'BOOSTER' })),
        el('div', { class: 'packinfo' },
          bar(d.nextPack.pct),
          el('div', { class: 'sub', text: t('packs.next', fmt(d.nextPack.into), fmt(d.nextPack.span), eta(d.nextPack.span - d.nextPack.into, d.perDay)) }),
          el('div', { class: 'btns' }, openBtn('pack', d.packs, t('packs.pack')), openBtn('premium', d.premium, t('packs.premium')), openBtn('ball', d.balls, t('packs.ball'))))));

    const shopBox = box(t('shop.title'),
      el('div', { class: 'row' }, el('b', { text: t('shop.coins', d.coins) }),
        el('span', { class: d.pace ? 'pace on' : 'pace', title: t('shop.paceTip'), text: d.pace ? t('shop.paceOn') : t('shop.paceOff') })),
      ...d.shop.map(i => el('div', { class: 'shopitem' },
        el('div', { class: 'si' }, el('div', { text: i.name }), el('div', { class: 'sub', text: i.desc })),
        el('button', { class: 'btn', ...(i.price !== null && d.coins >= i.price ? {} : { disabled: '' }), text: i.price === null ? t('shop.max') : '🪙 ' + i.price, onclick: () => send('buy', { item: i.id }) }))));

    const slots = d.slots.map(s => s ? slotView(s, d.perDay) : el('div', { class: 'empty-slot', text: d.albumUnique ? t('slot.freeAlbum') : t('slot.freeEmpty') }));

    const max = Math.max(1, ...d.daily.map(x => d.unit === 'credits' ? x.credits : x.total));
    const chart = el('div', { class: 'chart' }, d.daily.map(x => {
      const v = d.unit === 'credits' ? x.credits : x.total;
      return el('div', { style: 'height:' + Math.max(2, (v / max) * 100) + '%', title: x.date + ': ' + fmt(v) });
    }));
    const list = arr => arr.length ? arr.map(m => row(m.name, fmt(m.total))) : [el('div', { class: 'sub', text: t('nodata') })];

    app.replaceChildren(
      box(t('quota.title'), row(fmt(d.used) + unit, t('quota.of', q.toFixed(1), fmt(d.limit))),
        bar(q, q >= 100 ? 'err' : q >= 80 ? 'warn' : ''), row(t('quota.today'), fmt(d.today.total)), row(t('quota.month'), fmt(d.month.total))),
      packBox,
      box(t('training.title', d.slots.filter(Boolean).length, d.slots.length), ...slots),
      shopBox,
      itemsBox(),
      albumBox(),
      box(t('daily.title'), chart),
      box(t('models.title'), ...list(d.byModel)));

    announce(d.events || []);
    if (q >= 80 && q < 100 && warned < 80) { warned = 80; toast(t('toast.warn', q.toFixed(0))); }
    if (q >= 100 && warned < 100) { warned = 100; toast(t('toast.quotaOut')); }
    if (q < 80) warned = 0;
  }

  function slotView(s, perDay) {
    const c = s.card;
    return el('div', { class: 'center' },
      cardEl(c, 150),
      el('div', { class: 'row', style: 'justify-content:center;margin-top:6px' }, el('b', { text: c.name }), badge(c.tier)),
      el('div', { class: 'sub', text: info(c) }),
      statsEl(c),
      s.boost ? el('div', { class: 'sub', text: t('slot.boost', fmt(s.boost)) }) : null,
      s.branches ? branchChoice(s) : null,
      s.branches ? null : s.mastered ? el('div', { class: 'sub', text: t('slot.mastered') }) : bar(s.pct),
      s.mastered || s.branches ? null : el('div', { class: 'sub', text: t('slot.progress', fmt(s.into), fmt(s.span), eta(s.span - s.into, perDay)) + (s.evolved ? t('slot.evolutions', s.evolved) : '') }),
      el('button', { class: 'btn ghost', style: 'margin-top:6px', text: t('slot.retire'), title: t('slot.retireTip'), onclick: () => send('untrain', { id: s.id }) }));
  }

  /** The line branches: one button per species (those that need an item are disabled until you have it) plus a free random option. */
  function branchChoice(s) {
    return el('div', { class: 'branches' },
      el('div', { class: 'sub', text: t('slot.branchTitle', s.card.name) }),
      ...s.branches.map(b => el('button', {
        class: 'btn' + (b.item ? '' : ' ghost'), ...(b.have ? {} : { disabled: '' }),
        text: b.item ? t(b.have ? 'slot.branchItem' : 'slot.branchNeeds', b.name, itemIcon(b.item) + ' ' + itemName(b.item)) : b.name,
        onclick: () => send('chooseEvolution', { id: s.id, choice: b.name }),
      })),
      el('button', { class: 'btn ghost', text: t('slot.branchNatural'), onclick: () => send('chooseEvolution', { id: s.id, choice: 'natural' }) }));
  }

  /** The mystery box; the items themselves live in the album's Items tab. */
  function itemsBox() {
    const d = S;
    const count = Object.values(d.items || {}).reduce((n, v) => n + (v > 0 ? v : 0), 0);
    return box(t('items.title'),
      el('div', { class: 'sub', text: count ? t('items.summary', count) : t('items.empty') }),
      el('button', { class: 'btn', style: 'width:100%;margin-top:8px', ...(d.boxes ? {} : { disabled: '' }), text: t('box.open', d.boxes), onclick: () => send('openBox') }),
      el('button', { class: 'btn ghost', style: 'width:100%;margin-top:6px', text: t('items.seeAlbum'), onclick: () => send('openAlbum', { tab: 'items' }) }));
  }

  function showBox(id) {
    overlay.replaceChildren(
      el('div', { class: 'hint', text: t('box.found') }),
      el('div', { class: 'itemfound' }, el('div', { class: 'big', text: itemIcon(id) }), el('b', { text: itemName(id) }), el('div', { class: 'sub', text: itemDesc(id) })),
      el('button', { class: 'btn', text: t('box.ok'), onclick: closeOverlay }));
    overlay.querySelector('.btn')?.focus();
  }

  /** Album summary: the full album lives in an editor tab. */
  function albumBox() {
    const d = S;
    const recent = d.recent.length
      ? el('div', { class: 'recent' }, d.recent.map(c => press(el('div', { class: 'thumb', style: '--tc:var(' + TCOLOR[c.tier] + ')', title: c.name + ' · ' + c.rarity },
        c.src ? el('img', { src: c.src, alt: '' }) : el('div', { class: 'nm', text: c.name })), () => send('openAlbum', { id: c.id }), t('album.openAria', c.name))))
      : el('div', { class: 'sub', text: t('album.empty') });
    return box(t('album.title'),
      row(t('album.distinct', d.albumUnique), t('album.total', d.albumTotal)),
      row(t('album.lines'), String(d.mastered)),
      recent,
      el('button', { class: 'btn', style: 'width:100%;margin-top:8px', text: t('album.open'), onclick: () => send('openAlbum') }));
  }

  function closeOverlay() { overlay.replaceChildren(); }

  /* ───── opening a pack ───── */
  function showOpening(kind) {
    overlay.replaceChildren(
      el('div', { class: 'hint', text: kind === 'ball' ? t('open.ball') : t('open.pack') }),
      el('div', { class: 'pack big shake' }, el('div', { class: 'ball' }), el('b', { text: 'BOOSTER' })));
  }

  function showReveal(cards) {
    let left = cards.length;
    const done = el('button', { class: 'btn', text: t('reveal.done'), style: 'display:none', onclick: closeOverlay });
    const hint = el('div', { class: 'hint', text: t('reveal.hint') });
    const cells = cards.map(c => {
      const cell = el('div', { class: 'cell' });
      const back = press(el('div', { class: 'back', style: '--w:130px' }, el('div', { class: 'ball' })), () => flip(), t('reveal.flip'));
      function flip() {
        if (!back.isConnected) return;
        const face = cardEl(c, 130); face.classList.add('reveal-in');
        back.replaceWith(face);
        cell.append(
          el('div', { class: 'nm' }, el('b', { text: c.name }), document.createTextNode(' '), badge(c.tier), c.isNew ? el('span', { class: 'newtag', text: t('reveal.new') }) : null),
          el('div', { class: 'sub center', text: [eraName(c), variantName(c), c.set].filter(Boolean).join(' · ') }),
          freeSlot() ? el('button', { class: 'btn ghost', text: t('reveal.train'), onclick: e => { send('train', { id: c.id }); e.target.disabled = true; e.target.textContent = t('reveal.training'); } }) : null);
        if (--left === 0) { hint.textContent = t('reveal.complete'); done.style.display = ''; }
      }
      cell._flip = flip;
      cell.append(back);
      return cell;
    });
    const all = el('button', { class: 'btn ghost', text: t('reveal.all'), onclick: () => cells.forEach(c => c._flip()) });
    overlay.replaceChildren(hint, el('div', { class: 'revgrid' }, cells), el('div', { class: 'row', style: 'gap:8px' }, all, done));
  }

  /* ───── notices ───── */
  let toastTimer;
  function toast(text) {
    document.querySelectorAll('.toast').forEach(x => x.remove());
    const node = el('div', { class: 'toast', text });
    document.body.append(node);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), 4500);
  }
  function announce(events) {
    for (const e of events) {
      if (e.startsWith('packs:')) toast(e === 'packs:1' ? t('toast.packsOne') : t('toast.packsMany', e.slice(6)));
      else if (e === 'bonusPack') toast(t('toast.bonus'));
      else if (e.startsWith('evolve:')) toast(t('toast.evolved', e.slice(7)));
      else if (e.startsWith('graduate:')) toast(t('toast.graduated', e.slice(9)));
      else if (e.startsWith('branch:')) toast(t('toast.branch', e.slice(7)));
      else if (e.startsWith('graded:')) {
        const [, grade, better, ...name] = e.split(':');
        toast(better === '1' ? t('toast.graded', name.join(':'), grade, t('grade.' + grade)) : t('toast.gradedSame', name.join(':'), grade, t('grade.' + grade)));
      }
      else if (e.startsWith('level:')) { const [, name, lv] = e.split(':'); toast(t('toast.level', name, lv)); }
    }
  }

  window.addEventListener('message', ev => {
    const m = ev.data || {};
    if (m.type === 'state') { S = m.data; setLang(S.lang); render(); }
    else if (m.type === 'opening') showOpening(m.kind);
    else if (m.type === 'reveal') showReveal(m.cards);
    else if (m.type === 'boxOpened') showBox(m.item);
    else if (m.type === 'openFailed') { closeOverlay(); toast(t('toast.openFailed')); }
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeOverlay(); });
  vscode.postMessage({ type: 'ready' });
})();
