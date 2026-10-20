(function () {
  const vscode = acquireVsCodeApi();
  const { TCOLOR, fmt, el, badge, cardEl } = window.PT;
  const app = document.getElementById('app');
  const overlay = document.getElementById('overlay');

  let S = null;            // último estado recibido
  let warned = 0;
  const row = (a, b) => el('div', { class: 'row' }, el('span', { text: a }), el('span', { text: b }));
  const box = (title, ...kids) => el('div', { class: 'card-box' }, title && el('h4', { text: title }), ...kids);
  const bar = (pct, cls) => el('div', { class: 'barwrap ' + (cls || '') }, el('i', { style: 'width:' + Math.max(0, Math.min(100, pct)).toFixed(1) + '%' }));
  const send = (type, extra) => vscode.postMessage(Object.assign({ type }, extra));
  const freeSlot = () => !!S && S.slots.some(s => s === null);

  /* ───── panel principal ───── */
  function render() {
    const d = S;
    const q = d.pct;
    const unit = d.unit === 'credits' ? ' créditos' : ' tokens';

    const openBtn = (kind, n, label) => el('button', { class: 'btn' + (kind === 'pack' ? '' : ' ghost'), ...(n ? {} : { disabled: '' }), text: label + ' (' + n + ')', onclick: () => send('openPack', { kind }) });
    const packBox = box('Sobres',
      el('div', { class: 'packrow' },
        el('div', { class: 'pack' }, el('div', { class: 'ball' }), el('b', { text: 'BOOSTER' })),
        el('div', { class: 'packinfo' },
          bar(d.nextPack.pct),
          el('div', { class: 'sub', text: fmt(d.nextPack.into) + ' / ' + fmt(d.nextPack.span) + ' tokens al próximo sobre gratis' }),
          el('div', { class: 'btns' }, openBtn('pack', d.packs, 'Sobre'), openBtn('premium', d.premium, 'Premium'), openBtn('ball', d.balls, 'Pokébola')))));

    const shopBox = box('Tienda',
      el('div', { class: 'row' }, el('b', { text: '🪙 ' + d.coins + ' monedas' }),
        el('span', { class: d.pace ? 'pace on' : 'pace', title: 'Ganas +20 % de monedas mientras tu uso del cupo vaya por debajo del ritmo del mes', text: d.pace ? '+20 % por ir bajo el ritmo' : 'sin bonus de ritmo' })),
      ...d.shop.map(i => el('div', { class: 'shopitem' },
        el('div', { class: 'si' }, el('div', { text: i.name }), el('div', { class: 'sub', text: i.desc })),
        el('button', { class: 'btn', ...(i.price !== null && d.coins >= i.price ? {} : { disabled: '' }), text: i.price === null ? 'Máximo' : '🪙 ' + i.price, onclick: () => send('buy', { item: i.id }) }))));

    const slots = d.slots.map(s => s ? slotView(s) : el('div', { class: 'empty-slot', text: d.albumUnique ? 'Hueco libre: abre el álbum, elige una carta y pulsa «Entrenar».' : 'Abre tu primer sobre para conseguir cartas.' }));

    const max = Math.max(1, ...d.daily.map(x => d.unit === 'credits' ? x.credits : x.total));
    const chart = el('div', { class: 'chart' }, d.daily.map(x => {
      const v = d.unit === 'credits' ? x.credits : x.total;
      return el('div', { style: 'height:' + Math.max(2, (v / max) * 100) + '%', title: x.date + ': ' + fmt(v) });
    }));
    const list = arr => arr.length ? arr.map(m => row(m.name, fmt(m.total))) : [el('div', { class: 'sub', text: 'Sin datos todavía' })];

    app.replaceChildren(
      box('Cuota mensual', row(fmt(d.used) + unit, q.toFixed(1) + '% de ' + fmt(d.limit)),
        bar(q, q >= 100 ? 'err' : q >= 80 ? 'warn' : ''), row('Hoy', fmt(d.today.total)), row('Mes', fmt(d.month.total))),
      packBox,
      box('Entrenando (' + d.slots.filter(Boolean).length + '/' + d.slots.length + ')', ...slots),
      shopBox,
      albumBox(),
      box('Por día (mes)', chart),
      box('Por modelo', ...list(d.byModel)),
      box('Por modo', ...list(d.byMode)));

    announce(d.events || []);
    if (q >= 80 && q < 100 && warned < 80) { warned = 80; toast('Cuidado: ' + q.toFixed(0) + '% del cupo mensual'); }
    if (q >= 100 && warned < 100) { warned = 100; toast('Cupo mensual agotado'); }
    if (q < 80) warned = 0;
  }

  function slotView(s) {
    const c = s.card;
    return el('div', { class: 'center' },
      cardEl(c, 150),
      el('div', { class: 'row', style: 'justify-content:center;margin-top:6px' }, el('b', { text: c.name }), badge(c.tier)),
      el('div', { class: 'sub', text: [c.stage, c.hp ? c.hp + ' PS' : '', c.set].filter(Boolean).join(' · ') }),
      bar(s.pct),
      el('div', { class: 'sub', text: fmt(s.into) + ' / ' + fmt(s.span) + ' tokens para evolucionar' + (s.evolved ? ' · evoluciones: ' + s.evolved : '') }));
  }

  /** Resumen del álbum: el álbum completo vive en una pestaña del editor. */
  function albumBox() {
    const d = S;
    const recent = d.recent.length
      ? el('div', { class: 'recent' }, d.recent.map(c => el('div', { class: 'thumb', style: '--tc:var(' + TCOLOR[c.tier] + ')', title: c.name + ' · ' + c.rarity, onclick: () => send('openAlbum', { id: c.id }) },
        c.src ? el('img', { src: c.src, alt: c.name }) : el('div', { class: 'nm', text: c.name }))))
      : el('div', { class: 'sub', text: 'Tu álbum está vacío.' });
    return box('Álbum',
      row(d.albumUnique + ' cartas distintas', d.albumTotal + ' en total'),
      row('Líneas completadas', String(d.mastered)),
      recent,
      el('button', { class: 'btn', style: 'width:100%;margin-top:8px', text: 'Abrir álbum', onclick: () => send('openAlbum') }));
  }

  function closeOverlay() { overlay.replaceChildren(); }

  /* ───── apertura de sobre ───── */
  function showOpening(kind) {
    overlay.replaceChildren(
      el('div', { class: 'hint', text: kind === 'ball' ? 'Lanzando Pokébola…' : 'Abriendo sobre…' }),
      el('div', { class: 'pack big shake' }, el('div', { class: 'ball' }), el('b', { text: 'BOOSTER' })));
  }

  function showReveal(cards) {
    let left = cards.length;
    const done = el('button', { class: 'btn', text: 'Listo', style: 'display:none', onclick: closeOverlay });
    const hint = el('div', { class: 'hint', text: 'Toca cada carta para darle la vuelta' });
    const cells = cards.map(c => {
      const cell = el('div', { class: 'cell' });
      const back = el('div', { class: 'back', style: '--w:130px', onclick: () => flip() }, el('div', { class: 'ball' }));
      function flip() {
        if (!back.isConnected) return;
        const face = cardEl(c, 130); face.classList.add('reveal-in');
        back.replaceWith(face);
        cell.append(
          el('div', { class: 'nm' }, el('b', { text: c.name }), document.createTextNode(' '), badge(c.tier), c.isNew ? el('span', { class: 'newtag', text: ' NUEVA' }) : null),
          freeSlot() ? el('button', { class: 'btn ghost', text: 'Entrenar', onclick: e => { send('train', { id: c.id }); e.target.disabled = true; e.target.textContent = 'Entrenando'; } }) : null);
        if (--left === 0) { hint.textContent = '¡Sobre completo!'; done.style.display = ''; }
      }
      cell._flip = flip;
      cell.append(back);
      return cell;
    });
    const all = el('button', { class: 'btn ghost', text: 'Revelar todas', onclick: () => cells.forEach(c => c._flip()) });
    overlay.replaceChildren(hint, el('div', { class: 'revgrid' }, cells), el('div', { class: 'row', style: 'gap:8px' }, all, done));
  }

  /* ───── avisos ───── */
  let toastTimer;
  function toast(text) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = el('div', { class: 'toast', text });
    document.body.append(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 4500);
  }
  function announce(events) {
    for (const e of events) {
      if (e.startsWith('packs:')) toast('¡Ganaste ' + e.slice(6) + (e === 'packs:1' ? ' sobre nuevo!' : ' sobres nuevos!'));
      else if (e === 'bonusPack') toast('Cupo al 100%: sobre de regalo');
      else if (e.startsWith('evolve:')) toast('¡Tu carta evolucionó a ' + e.slice(7) + '!');
      else if (e.startsWith('graduate:')) toast(e.slice(9) + ' completó su línea · +1 sobre');
    }
  }

  window.addEventListener('message', ev => {
    const m = ev.data || {};
    if (m.type === 'state') { S = m.data; render(); }
    else if (m.type === 'opening') showOpening(m.kind);
    else if (m.type === 'reveal') showReveal(m.cards);
    else if (m.type === 'openFailed') { closeOverlay(); toast('No se pudo abrir el sobre (sin conexión)'); }
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeOverlay(); });
  vscode.postMessage({ type: 'ready' });
})();
